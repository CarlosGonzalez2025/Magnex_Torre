import { Vehicle, ApiSource, VehicleStatus } from '../types';

const CITIES = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena'];
const DRIVERS = ['Juan Pérez', 'Carlos Ruiz', 'Ana Gómez', 'Pedro Rodriguez', 'Maria Lopez'];

// Helper to generate random coordinates around Colombia
const generateLocation = () => {
  // Center roughly around 4.5709° N, 74.2973° W
  const lat = 4.0 + (Math.random() * 6 - 3); 
  const lng = -74.0 + (Math.random() * 6 - 3);
  return { lat, lng };
};

export const generateMockVehicles = (count: number): Vehicle[] => {
  return Array.from({ length: count }).map((_, index) => {
    const isFagor = Math.random() > 0.5;
    const source = isFagor ? ApiSource.FAGOR : ApiSource.COLTRACK;
    const { lat, lng } = generateLocation();
    
    // Determine status based on random speed
    const speed = Math.random() > 0.3 ? Math.floor(Math.random() * 80) + 10 : 0;
    let status = VehicleStatus.OFF;
    
    if (speed > 0) {
      status = VehicleStatus.MOVING;
    } else if (Math.random() > 0.5) {
      status = VehicleStatus.IDLE;
    } else {
      status = VehicleStatus.STOPPED;
    }

    return {
      id: `VEH-${index + 1000}`,
      plate: `${isFagor ? 'FAG' : 'COL'}-${Math.floor(Math.random() * 900) + 100}`,
      source,
      latitude: lat,
      longitude: lng,
      speed,
      status,
      driver: DRIVERS[Math.floor(Math.random() * DRIVERS.length)],
      fuelLevel: Math.floor(Math.random() * 100),
      lastUpdate: new Date().toISOString(),
      location: CITIES[Math.floor(Math.random() * CITIES.length)],
      odometer: Math.floor(Math.random() * 100000) + 50000,
    };
  });
};