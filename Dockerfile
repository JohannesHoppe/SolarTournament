FROM nodesource/node:6.3

ADD package.json package.json  
RUN npm install --production

ADD . .

#production is broken
ENV NODE_ENV development
ENV port 80

EXPOSE 80
EXPOSE 443

CMD ["npm", "run", "startForever"] 