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
    async with flight_lock:
        logger.info(f"Starting flight to {target_lat}, {target_lon}")
        
        # Wait for GPS/home
        async for health in drone.telemetry.health():
            if health.is_global_position_ok and health.is_home_position_ok:
                logger.info("GPS and home position ready")
                break

        # Get current absolute altitude if not provided
        async for pos in drone.telemetry.position():
            current_abs_alt = pos.absolute_altitude_m
            logger.info(f"Current position: {pos.latitude_deg}, {pos.longitude_deg}, {current_abs_alt}m")
            break
            
        target_abs_alt = altitude_m if altitude_m is not None else current_abs_alt
        logger.info(f"Target altitude: {target_abs_alt}m")

        # Arm + takeoff
        logger.info("Arming and taking off...")
        await drone.action.arm()
        await drone.action.takeoff()
        await asyncio.sleep(3)

        # Go to target
        logger.info(f"Flying to target: {target_lat}, {target_lon}, {target_abs_alt}m")
        await drone.action.goto_location(target_lat, target_lon, target_abs_alt, 0)

        # Wait until close to target
        async for pos in drone.telemetry.position():
            dlat = (pos.latitude_deg - target_lat)
            dlon = (pos.longitude_deg - target_lon)
            approx_m = ((dlat * 111_320)**2 + (dlon * 100_000)**2) ** 0.5
            
            if approx_m < 5:  # within 5m
                logger.info(f"Reached target (within {approx_m:.1f}m)")
                break

        # Land
        logger.info("Landing...")
        await drone.action.land()
        logger.info("Flight complete")

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
