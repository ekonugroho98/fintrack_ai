FROM node:20-alpine

WORKDIR /app

# Install dependencies first to leverage Docker cache
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Command to run the worker
CMD ["npm", "start"]
