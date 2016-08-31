$(function () {

    $.ajax({
        
        url: "/getTopTen",
        success: function (data) {
            $("#highscoreTemplate").tmpl(data).appendTo("#highscorePlaceholder");
        }
    });

});

function getCounter() {

    if (typeof getCounter.counter == 'undefined') {
        getCounter.counter = 0;
    }

    return (++getCounter.counter);

}