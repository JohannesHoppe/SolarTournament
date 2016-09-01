FROM nodesource/node:4.0

ADD package.json package.json  
RUN npm install --production

ADD . .

#production is broken ATM
#ENV NODE_ENV production
ENV port 80

EXPOSE 80
EXPOSE 443

CMD ["npm", "run", "startForever"] 