FROM nodesource/node:4.0

ADD package.json package.json  
RUN npm install --production

ADD . .

ENV NODE_ENV production
ENV port 80

EXPOSE 80
CMD ["npm", "run", "startForever"]  