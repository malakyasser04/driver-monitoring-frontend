import { io } from 'socket.io-client';

export function createSocket(backendUrl) {
  return io(backendUrl, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    timeout: 8000
  });
}

