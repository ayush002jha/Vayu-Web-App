# server.py
import asyncio
import logging
from typing import Optional, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from pydantic import BaseModel, Field
from mavsdk import System
from fastapi.middleware.cors import CORSMiddleware

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

drone = System()
telemetry_clients: Set[WebSocket] = set()
flight_lock = asyncio.Lock()

class TriggerRequest(BaseModel):
    target_lat: float = Field(..., ge=-90, le=90)
    target_lon: float = Field(..., ge=-180, le=180)
    altitude_m: Optional[float] = Field(None, gt=0)

@app.on_event("startup")
async def startup_event():
    logger.info("Connecting to PX4 SITL via MAVSDK...")
    await drone.connect(system_address="udp://:14540")
    async for state in drone.core.connection_state():
        if state.is_connected:
            logger.info("✅ Connected to drone")
            break
    
    # Ensure telemetry stream is enabled
    await drone.telemetry.set_rate_position(5.0)  # 5Hz updates
    await drone.telemetry.set_rate_health(1.0)

@app.websocket("/ws/telemetry")
async def telemetry_ws(ws: WebSocket):
    await ws.accept()
    client_id = f"{ws.client.host}:{ws.client.port}"
    logger.info(f"WebSocket client {client_id} connected")
    
    telemetry_clients.add(ws)
    
    try:
        # Send live position stream to this client
        async for pos in drone.telemetry.position():
            if ws not in telemetry_clients:  # Client was removed
                break
                
            msg = {
                "lat": pos.latitude_deg,
                "lon": pos.longitude_deg,
                "abs_alt_m": pos.absolute_altitude_m,
                "rel_alt_m": pos.relative_altitude_m,
            }
            
            try:
                await ws.send_json(msg)
            except Exception as e:
                logger.warning(f"Failed to send to client {client_id}: {e}")
                break
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected normally")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        try:
            await ws.send_json({"error": str(e)})
        except:
            pass
    finally:
        telemetry_clients.discard(ws)
        logger.info(f"WebSocket client {client_id} removed from telemetry_clients")

async def fly_to_location(target_lat: float, target_lon: float, altitude_m: Optional[float]):
    """
    Enhanced flight function with altitude-first approach:
    1. Takeoff
    2. Wait until target altitude is reached
    3. Then navigate to target location at that altitude
    4. Hover and RTL
    """
    async with flight_lock:
        logger.info(f"Starting flight to {target_lat}, {target_lon}")
        logger.info(f"Requested altitude: {altitude_m}m {'(above home ground)' if altitude_m else '(current altitude)'}")
        
        # Wait for GPS/home
        async for health in drone.telemetry.health():
            if health.is_global_position_ok and health.is_home_position_ok:
                logger.info("GPS and home position ready")
                break

        # Get home position absolute altitude
        async for terrain_info in drone.telemetry.home():
            home_absolute_altitude = terrain_info.absolute_altitude_m
            logger.info(f"Home ground level: {home_absolute_altitude:.1f}m AMSL")
            break
            
        # Calculate target absolute altitude
        if altitude_m is not None:
            target_abs_alt = home_absolute_altitude + altitude_m
            logger.info(f"✅ Target altitude: {altitude_m}m above home ground")
            logger.info(f"✅ Target absolute altitude: {target_abs_alt:.1f}m AMSL")
        else:
            # Get current altitude if none provided
            async for pos in drone.telemetry.position():
                target_abs_alt = pos.absolute_altitude_m
                break
            logger.info(f"✅ Using current altitude: {target_abs_alt:.1f}m AMSL")

        # Safety check
        min_safe_altitude = home_absolute_altitude + 5
        if target_abs_alt < min_safe_altitude:
            logger.warning(f"⚠️ Target altitude too low, using {min_safe_altitude:.1f}m")
            target_abs_alt = min_safe_altitude

        # Arm + takeoff
        logger.info("🚁 Arming and taking off...")
        await drone.action.arm()
        await drone.action.takeoff()
        
        # NEW: Wait until drone reaches target altitude BEFORE going to target location
        logger.info(f"⬆️ Climbing to target altitude: {target_abs_alt:.1f}m AMSL...")
        
        # If target altitude is different from default takeoff altitude, command it
        current_lat, current_lon = None, None
        async for pos in drone.telemetry.position():
            current_lat = pos.latitude_deg
            current_lon = pos.longitude_deg
            current_alt = pos.absolute_altitude_m
            logger.info(f"Current position after takeoff: {current_alt:.1f}m AMSL")
            break
        
        # Command drone to target altitude at current location
        if abs(current_alt - target_abs_alt) > 2:  # Only if more than 2m difference
            logger.info(f"🎯 Adjusting altitude from {current_alt:.1f}m to {target_abs_alt:.1f}m at current location")
            await drone.action.goto_location(current_lat, current_lon, target_abs_alt, 0)
        
        # Wait until target altitude is reached
        logger.info("⏳ Waiting to reach target altitude before proceeding to target location...")
        altitude_reached = False
        while not altitude_reached:
            async for pos in drone.telemetry.position():
                current_alt = pos.absolute_altitude_m
                altitude_diff = abs(current_alt - target_abs_alt)
                
                if altitude_diff < 1.0:  # Within 1m of target altitude
                    logger.info(f"✅ Target altitude reached: {current_alt:.1f}m AMSL (±{altitude_diff:.1f}m)")
                    altitude_reached = True
                    break
                else:
                    logger.info(f"🔄 Climbing... Current: {current_alt:.1f}m, Target: {target_abs_alt:.1f}m (diff: {altitude_diff:.1f}m)")
                    await asyncio.sleep(1)  # Check every second
                break

        # NOW navigate to target location at the established altitude
        logger.info(f"➡️ Proceeding to target location at {target_abs_alt:.1f}m altitude")
        logger.info(f"🎯 Flying to target: {target_lat:.6f}, {target_lon:.6f}")
        await drone.action.goto_location(target_lat, target_lon, target_abs_alt, 0)

        # Wait until close to target (horizontal distance)
        logger.info("📍 Monitoring approach to target location...")
        async for pos in drone.telemetry.position():
            dlat = (pos.latitude_deg - target_lat)
            dlon = (pos.longitude_deg - target_lon)
            approx_m = ((dlat * 111_320)**2 + (dlon * 100_000)**2) ** 0.5
            
            if approx_m < 5:
                logger.info(f"✅ Reached target location (within {approx_m:.1f}m)")
                break

        # Hover at 1m above home ground level
        logger.info("⬇️ Descending to hover altitude...")
        hover_altitude = home_absolute_altitude + 1.0
        logger.info(f"🎯 Hover altitude: {hover_altitude:.1f}m AMSL (1m above home ground)")

        await drone.action.goto_location(target_lat, target_lon, hover_altitude, 0)
        
        # Wait for hover altitude
        logger.info("⏳ Waiting to reach hover altitude...")
        async for pos in drone.telemetry.position():
            current_height_above_home = pos.absolute_altitude_m - home_absolute_altitude
            if abs(current_height_above_home - 1.0) < 0.5:
                logger.info(f"✅ At hover altitude: {current_height_above_home:.1f}m above home")
                break
        
        # Hover for 3 seconds
        logger.info("⏰ Hovering for 3 seconds...")
        await asyncio.sleep(3)
        
        # Return to launch
        logger.info("🏠 Returning to launch position...")
        await drone.action.return_to_launch()
        
        # Monitor RTL progress
        logger.info("📡 Monitoring RTL progress...")
        rtl_timeout = 0
        async for flight_mode in drone.telemetry.flight_mode():
            logger.info(f"Flight mode: {flight_mode}")
            rtl_timeout += 1
            
            if flight_mode == "LAND" or rtl_timeout > 100:
                logger.info("✅ RTL completed, drone landing at home position")
                break
            
            await asyncio.sleep(1)
        
        logger.info("🎉 Flight sequence complete!")


@app.post("/trigger")
async def trigger_drone(req: TriggerRequest, background_tasks: BackgroundTasks):
    logger.info(f"Received flight request: {req.target_lat}, {req.target_lon}, alt={req.altitude_m}")
    background_tasks.add_task(fly_to_location, req.target_lat, req.target_lon, req.altitude_m)
    return {"status": "accepted", "target": [req.target_lat, req.target_lon]}

# Add this endpoint to server.py
@app.get("/drone/position")
async def get_drone_position():
    """Get current drone position"""
    try:
        async for pos in drone.telemetry.position():
            return {
                "lat": pos.latitude_deg,
                "lon": pos.longitude_deg,
                "abs_alt_m": pos.absolute_altitude_m,
                "rel_alt_m": pos.relative_altitude_m,
            }
    except Exception as e:
        return {"error": str(e)}
