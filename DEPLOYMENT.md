# Deployment Guide

This guide explains how to deploy the AI Agent Keuangan application on a VPS using Docker and Docker Compose.

## Prerequisites

- A VPS with Ubuntu 20.04 or later
- Docker installed
- Docker Compose installed
- Git installed
- Domain name (optional, for production)

## Installation Steps

1. **Install Docker and Docker Compose**

```bash
# Update package list
sudo apt update

# Install required packages
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Add Docker repository
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Update package list again
sudo apt update

# Install Docker
sudo apt install -y docker-ce

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **Clone the Repository**

```bash
git clone <repository-url>
cd aiagent-keuangan
```

3. **Environment Configuration**

Create a `.env` file in the root directory with the following variables:

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=ai_service

# Redis
REDIS_PASSWORD=your_secure_redis_password

# API Keys and other secrets
GOOGLE_API_KEY=your_google_api_key
OPENAI_API_KEY=your_openai_api_key
```

4. **Build and Start the Services**

```bash
# Build the images
docker-compose build

# Start the services
docker-compose up -d
```

5. **Verify Deployment**

Check if all services are running:

```bash
docker-compose ps
```

## Production Deployment

For production deployment, consider the following additional steps:

1. **Set up Nginx as Reverse Proxy**

Install Nginx:

```bash
sudo apt install nginx
```

Create an Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/aiagent
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/aiagent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

2. **Set up SSL with Let's Encrypt**

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

3. **Set up Firewall**

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

## Maintenance

### Viewing Logs

```bash
# View all logs
docker-compose logs

# View logs for a specific service
docker-compose logs ai-service
```

### Updating the Application

```bash
# Pull latest changes
git pull

# Rebuild and restart services
docker-compose down
docker-compose build
docker-compose up -d
```

### Backup Database

```bash
# Create a backup
docker-compose exec db pg_dump -U postgres ai_service > backup.sql

# Restore from backup
cat backup.sql | docker-compose exec -T db psql -U postgres ai_service
```

## Troubleshooting

1. **Service not starting**
   - Check logs: `docker-compose logs <service-name>`
   - Verify environment variables
   - Check port conflicts

2. **Database connection issues**
   - Verify database credentials
   - Check if database container is running
   - Ensure network connectivity between services

3. **Memory issues**
   - Monitor container resource usage: `docker stats`
   - Adjust container resource limits in docker-compose.yml if needed

## Security Considerations

1. Change all default passwords
2. Keep Docker and system packages updated
3. Use strong passwords for all services
4. Regularly backup your data
5. Monitor system logs for suspicious activity
6. Use SSL/TLS for all external connections
7. Implement rate limiting in Nginx
8. Regular security audits

## Monitoring

Consider setting up monitoring tools:

1. Prometheus for metrics collection
2. Grafana for visualization
3. ELK Stack for log management
4. Uptime monitoring service

## Support

For any deployment issues or questions, please contact the development team or create an issue in the repository. 