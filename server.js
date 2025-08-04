const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(__dirname));

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected');
    
    // Listen for input changes
    socket.on('input-change', (data) => {
        // Broadcast the input to all connected clients
        io.emit('update-display', data);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Input page: http://localhost:${PORT}/input.html`);
    console.log(`Display page: http://localhost:${PORT}/display.html`);
});
