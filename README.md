Welcome to SolarTournament
==========================

![Screenshot](https://raw.github.com/JohannesHoppe/SolarTournament/master/Screenshot_SolarTournament.jpg)

[SolarTournament](http://solartournament.org) is a browser-based, WebGL, 3D Online-Shooter with a simple multiplier mode. It was mainly developed back then in 2012. At this time WebGL was only supported in FireFox and Chrome, but not on mobile devices. It's great to see that the technology is widely adopted nowadays.

The game is written in ES5 Javascript / [Node.js](http://nodejs.org/) and uses the [express](http://expressjs.com/) web development framework, the [Jade](https://github.com/visionmedia/jade/blob/master/Readme.md) template engine, the [Stylus](http://learnboost.github.com/stylus/) CSS engine and [Socket.IO](http://socket.io/) for WebSocket communictation. The client-side rendering uses CopperLicht 3D, a JavaScript WebGL libraray from [Ambiera e.U.](http://www.ambiera.com/).

Debug
-----
```
npm i
npm start
```

Start via Docker
----------------
```
docker pull johanneshoppe/solartournament
docker run -d -p 80:80 --restart=always johanneshoppe/solartournament
```


zlib License
------------

Copyright © 2012 Johannes Hoppe
 
This software is provided 'as-is', without any express or implied warranty.  In no event will the authors be held liable for any damages arising from the use of this software.

Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and redistribute it freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.
 
The client side scripts were forked from the [CopperLicht](http://www.ambiera.com/copperlicht/) demo files, which are Copyright © 2009-2012 Nikolaus Gebhardt

__Please note:__

__The graphical assets (mainly both ships) are NOT covered by this license.__
Please ask for permission if you want to include them into any other software.