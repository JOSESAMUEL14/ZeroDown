# ZeroDown — Blue-Green Deployment for a Containerized E-Commerce Application

**Safer Releases. Controlled Deployments. Better Visibility.**

ZeroDown is a containerized e-commerce application that demonstrates the Blue-Green Deployment strategy using Docker and Kubernetes. It provides a customer storefront, manager dashboard, deployment switching, health verification, rollback handling, and application monitoring.

The project maintains two application environments:

- **Blue:** Version 1 (`zerodown:v1`)
- **Green:** Version 2 (`zerodown:v2`)

A Kubernetes Service controls which environment receives customer traffic. Before switching, the deployment automation checks the target environment's readiness and verifies the application version after the switch. If verification fails, it attempts to restore the previous traffic route.

## Key Features

### Customer Application
- E-commerce storefront and product listings.
- Customer authentication.
- Product categories and search.
- Shopping cart and quantity management.
- Wishlist management.
- Order functionality.

### Manager Dashboard
- Blue–Green deployment status.
- Deployment switching.
- Rollback functionality.
- Deployment history.
- Kubernetes readiness and availability information.

### DevOps and Monitoring
- Docker-based application images.
- Kubernetes Blue and Green deployments.
- Readiness checks before traffic switching.
- Automated version verification.
- Rollback on failed verification.
- Prometheus application metrics.
- Grafana monitoring integration.
- GitHub Actions CI pipeline.

## Architecture

```text
                 Developer
                     |
                     v
                GitHub Repo
                     |
                     v
               GitHub Actions
                 /       \
                v         v
             Jest Tests  Docker Builds
                         /       \
                        v         v
                   zerodown:v1  zerodown:v2
                        |         |
                        v         v
                  Blue Deployment
                  (2 Replicas)

                  Green Deployment
                  (2 Replicas)
                        |
                        v
               Kubernetes Service
                 (Traffic Selector)
                        |
                        v
                Active Application
                        |
              ---------------------
              |                   |
              v                   v
        Customer Storefront  Manager Dashboard
              |
              v
        Prometheus Metrics
              |
              v
         Grafana Monitoring
```

## Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | Backend runtime |
| Express.js | Application and API framework |
| PostgreSQL | Relational database |
| HTML, CSS, JavaScript | Frontend |
| Docker | Containerization |
| Kubernetes | Container orchestration |
| Minikube | Local Kubernetes environment |
| PowerShell | Deployment automation |
| Jest | Automated testing |
| Supertest | HTTP endpoint testing |
| Prometheus | Metrics collection |
| Grafana | Monitoring visualization |
| GitHub Actions | Continuous integration |
| Git and GitHub | Version control |

## Project Structure

```text
ZeroDown/
├── .github/
│   └── workflows/
│       └── ci.yml
├── k8s/
│   ├── blue-deployment.yaml
│   ├── green-deployment.yaml
│   ├── service.yaml
│   └── service-green.yaml
├── public/
│   ├── index.html
│   ├── manager.html
│   └── monitoring.html
├── scripts/
│   └── switch-deployment.ps1
├── src/
│   ├── config/
│   ├── controllers/
│   ├── db/
│   │   ├── index.js
│   │   ├── migrate.js
│   │   ├── schema.sql
│   │   └── seed.sql
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── app.js
├── tests/
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

## Prerequisites

Install the following:

- Node.js 22 or later
- npm
- PostgreSQL
- Docker Desktop
- Minikube
- kubectl or Minikube's kubectl integration
- Git
- PowerShell

## Local Setup

### 1. Clone the repository

```powershell
git clone https://github.com/JOSESAMUEL14/ZeroDown.git
cd ZeroDown
```

### 2. Install dependencies

```powershell
npm ci
```

### 3. Configure environment variables

Create your local environment file:

```powershell
Copy-Item .env.example .env
```

Update `.env` with your PostgreSQL connection details and unique credentials.

Configure at least:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET`
- `MANAGER_USERNAME`
- `MANAGER_PASSWORD`

Use a unique JWT secret of at least 32 characters. Never commit `.env` or publish real credentials.

### 4. Initialize the database

Create database tables:

```powershell
node --env-file=.env src/db/migrate.js
```

To initialize the database with sample catalog data:

```powershell
node --env-file=.env src/db/migrate.js --seed
```

### 5. Start the application

```powershell
node --env-file=.env server.js
```

Open:

- Storefront: `http://localhost:3000/`
- Manager dashboard: `http://localhost:3000/manager`
- Monitoring dashboard: `http://localhost:3000/monitoring`

The application port can be changed using the `PORT` environment variable.

## Docker Build

Build the Blue image:

```powershell
docker build --build-arg APP_VERSION=v1 -t zerodown:v1 .
```

Build the Green image:

```powershell
docker build --build-arg APP_VERSION=v2 -t zerodown:v2 .
```

The application container expects its runtime configuration to be supplied through environment variables. PostgreSQL must also be reachable from the container.

## Kubernetes Deployment

### 1. Start Minikube

```powershell
minikube start --driver=docker --cpus=2 --memory=2048
```

### 2. Load the application images

```powershell
minikube image load zerodown:v1
minikube image load zerodown:v2
```

### 3. Deploy Blue and Green environments

```powershell
minikube kubectl -- apply -f k8s/blue-deployment.yaml
minikube kubectl -- apply -f k8s/green-deployment.yaml
```

### 4. Configure the initial Blue traffic route

```powershell
minikube kubectl -- apply -f k8s/service.yaml
```

### 5. Verify the deployments

```powershell
minikube kubectl -- get deployments
minikube kubectl -- get pods
minikube kubectl -- get services
```

## Blue-Green Deployment and Rollback

The project includes a PowerShell script for controlled traffic switching.

Switch to Green:

```powershell
.\scripts\switch-deployment.ps1 -Target green
```

Switch to Blue:

```powershell
.\scripts\switch-deployment.ps1 -Target blue
```

The script:

1. Identifies the currently active deployment.
2. Checks the target deployment's ready replicas.
3. Aborts if the target is not healthy.
4. Updates the Kubernetes Service selector.
5. Starts a temporary port-forward.
6. Verifies the expected application version.
7. Attempts to restore the previous route if verification fails.

## Application Endpoints

| Endpoint | Purpose |
|---|---|
| `/` | Customer storefront |
| `/health` | Application health |
| `/version` | Active application version |
| `/metrics` | Prometheus metrics |
| `/manager` | Manager dashboard |
| `/monitoring` | Monitoring dashboard |

The manager dashboard and application APIs include protected operations. Configure manager credentials before use.

## Monitoring

ZeroDown exposes Prometheus metrics through `/metrics`.

The monitoring integration supports visibility into:

- HTTP request counts.
- Request duration.
- Node.js process metrics.
- Application health.
- Active application version.

Prometheus collects application metrics, while Grafana provides visualization.

Example PromQL queries:

**HTTP request rate**

```promql
sum by (version) (rate(zerodown_http_requests_total[1m]))
```

**Average response time**

```promql
(rate(zerodown_http_request_duration_seconds_sum[1m]) /
rate(zerodown_http_request_duration_seconds_count[1m])) * 1000
```

## Continuous Integration

The GitHub Actions workflow in `.github/workflows/ci.yml` performs:

1. Repository checkout.
2. Node.js setup.
3. Dependency installation.
4. Automated test execution.
5. Blue Docker image build.
6. Green Docker image build.

The current workflow runs for pushes to `main` and pull requests targeting `main`.

Kubernetes deployment and traffic switching remain separate local operations.

## Testing

Run the automated test suite:

```powershell
npm test
```

The integrated test suite contains coverage for application routes, authentication, cart and wishlist operations, database behavior, Kubernetes deployment logic, manager operations, orders and products.

**Latest local test result:** 8 test suites passed, 76 tests passed.

## Project Scope and Limitations

- The project demonstrates Blue-Green deployment using a local Minikube cluster.
- It does not claim a guaranteed production zero-downtime SLA.
- GitHub Actions currently builds and tests the application; it does not automatically deploy to Kubernetes.
- Deployment switching and rollback are executed locally using PowerShell.
- Checkout is a demonstration flow and does not process real payments.
- A production-scale cloud deployment and load-testing evaluation are outside the current implementation scope.

## Future Enhancements

- Automated Kubernetes deployment through CI/CD.
- Cloud Kubernetes integration.
- Automated load and performance testing.
- Deployment notifications and alerting.
- Advanced rollout and traffic-management strategies.

## Repository

GitHub: https://github.com/JOSESAMUEL14/ZeroDown

---

**ZeroDown — Safer Releases. Controlled Deployments. Better Visibility.**
