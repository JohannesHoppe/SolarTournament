var playingSounds = new Array();
var playingMusic = null;
var musicDisabled = false;
var currentlyPlayingMusicName = null;

function disableMusic(disable)
{
	musicDisabled = disable;
	if (disable)
	{
		if (playingMusic != null)
			playingMusic.pause();
		playingMusic = null;
	}
	else
	{
		if (playingMusic == null && currentlyPlayingMusicName != null)
			playmusic(currentlyPlayingMusicName);
	}
}
				
function playmusic(s)
{
	currentlyPlayingMusicName = s;
	if (musicDisabled)
		return;
	var a = new Audio();
	a.src = document.getElementById(s).src;
	a.loop = true;
	//a.load();
	a.play();	
	if (playingMusic != null)
		playingMusic.pause();
	playingMusic = a;
}

function playsound(s) 
{
	var thistime = new Date();
	var now = thistime.getTime();
	
	var origaudio = document.getElementById(s);
	if (origaudio == null)
		return;
	
	// the problem with this is that the audio will be reloaded by chrome, no matter what we do here.
	// seeking and restarting an audio file isn't possible as well.
	// so only play this once and wait for the situation to get better.
	origaudio.play();
	
/*	
	// clean up finished sounds and find free slot
	
	var freeslot = -1;
	var naudio = null;
	
	for (var a=0;a<playingSounds.length;a++) 
	{
		var ps = playingSounds[a];
		if (ps != null && ps.endplayingms < now &&
		    ps.src == origaudio.src) 
		{		
			freeslot = a;
			naudio = ps;
			break;
		}
	}
	
	
	
	
	if (freeslot == -1)
	{
		playingSounds.push(null);
		freeslot = playingSounds.length - 1;
		naudio = new Audio();
		playingSounds[freeslot] = naudio;
		naudio.src = origaudio.src;
	}	
	
	naudio.endplayingms = thistime.getTime() + document.getElementById(s).duration * 1000;
	naudio.loop = false;
	naudio.currentTime = 0;
	naudio.play();	*/
}