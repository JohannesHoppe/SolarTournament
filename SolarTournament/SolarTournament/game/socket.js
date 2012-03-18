module.exports = function (io) {

    io.sockets.on('connection', function(socket) {

        socket.emit('message', { message: 'hello world' });
        
        socket.on('clientMessage', function(data) {
            console.log(data);
        });
        
    });

}