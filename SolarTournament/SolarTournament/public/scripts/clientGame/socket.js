/*
(function (socketUri) {
$(function () {

var socket = io.connect(socketUri);

socket.on('message', function (data) {

alert("Server Message: " + data.message);
socket.emit('clientMessage', { my: 'Test 2' });
});

});
})(socketUri);
*/