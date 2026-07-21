const MAX_PORT = 65535;

export function candidatePorts(preferred: number, attempts = 10): number[] {
  const ports: number[] = [];
  for (let i = 0; i < attempts && preferred + i <= MAX_PORT; i++) {
    ports.push(preferred + i);
  }
  return ports;
}
