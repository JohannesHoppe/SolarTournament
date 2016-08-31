FROM nodesource/node:4.0

ADD package.json package.json  
RUN npm install --production

ADD . .

EXPOSE 1337
CMD ["npm", "run", "startForever"]  