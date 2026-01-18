import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Socket.io server running' });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('chat message', (msg: string) => {
    console.log('Message received:', msg);
    socket.broadcast.emit('chat message', msg);
  });

  socket.on('typing', (isTyping: boolean) => {
    socket.broadcast.emit('typing', { userId: socket.id, isTyping });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(8080, () => {
  console.log('Server running at http://localhost:8080');
});
