FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Mở cổng 5000 để giao tiếp
EXPOSE 5000
CMD ["npm", "start"]