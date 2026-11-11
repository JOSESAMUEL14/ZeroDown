
ZeroDown — Blue-Green Deployment for a Containerized E-Commerce Application
Safer Releases. Controlled Deployments. Better Visibility.

Live Demo
Customer Storefront: https://zerodown.onrender.com/
Public Storefront: https://zerodown.onrender.com/
Hosted Manager Dashboard (status view): https://zerodown.onrender.com/manager
The hosted application runs on Render and uses Neon PostgreSQL for its database. The public storefront supports customer registration, product browsing, cart operations, and demo checkout. Orders are stored in the shared Neon database.

Important — hosted manager limitation: The Render-hosted manager page cannot connect to the Minikube cluster running on a developer's laptop. When Kubernetes is unreachable from Render, the page displays simulated deployment information and disables traffic-switching and rollback controls. The hosted manager URL is therefore a status/demo view, not a remote Kubernetes controller. Actual Blue-Green switching is performed locally using the local application and Minikube. Checkout is for demonstration only and does not process real payments.

ZeroDown is a containerized e-commerce application that demonstrates the Blue-Green Deployment strategy using Docker and Kubernetes. It provides a customer storefront, manager dashboard, deployment switching, health verification, rollback handling, and application monitoring.

The project maintains two application environments:

Blue: Version 1 (zerodown:v1)
Green: Version 2 (zerodown:v2)
A Kubernetes Service controls which environment receives customer traffic. Before switching, the deployment automation checks the target environment's readiness and verifies the application version after the switch. If verification fails, it attempts to restore the previous traffic route.

Key Features
Customer Application
E-commerce storefront and product listings.
Customer authentication.
Product categories and search.
Shopping cart and quantity management.
Wishlist management.
Order functionality.
Manager Dashboard
Blue–Green deployment status.
Deployment switching.
Rollback functionality.
Deployment history.
Kubernetes readiness and availability information.
DevOps and Monitoring
Docker-based application images.
Kubernetes Blue and Green deployments.
Readiness checks before traffic switching.
Automated version verification.
Rollback on failed verification.
Prometheus application metrics.
Grafana monitoring integration.
GitHub Actions CI pipeline.
Architecture
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
Technology Stack
Technology	Purpose
Node.js	Backend runtime
Express.js	Application and API framework
PostgreSQL	Relational database
HTML, CSS, JavaScript	Frontend
Docker	Containerization
Kubernetes	Container orchestration
Minikube	Local Kubernetes environment
PowerShell	Deployment automation
Jest	Automated testing
Supertest	HTTP endpoint testing
Prometheus	Metrics collection
Grafana	Monitoring visualization
GitHub Actions	Continuous integration
Git and GitHub	Version control
Project Structure
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
Prerequisites
Install the following:

Node.js 22 or later
npm
PostgreSQL
Docker Desktop
Minikube
kubectl or Minikube's kubectl integration
Git
PowerShell
Local Setup
1. Clone the repository
git clone https://github.com/JOSESAMUEL14/ZeroDown.git
cd ZeroDown
2. Install dependencies
npm ci
3. Configure environment variables
Create your local environment file:

Copy-Item .env.example .env
Update .env with your PostgreSQL connection details and unique credentials.

Configure at least:

DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
JWT_SECRET
MANAGER_USERNAME
MANAGER_PASSWORD
Use a unique JWT secret of at least 32 characters. Never commit .env or publish real credentials.

4. Initialize the database
Create database tables:

node --env-file=.env src/db/migrate.js
To initialize the database with sample catalog data:

node --env-file=.env src/db/migrate.js --seed
5. Start the application
node --env-file=.env server.js
Open:

Storefront: http://localhost:3000/
Manager dashboard: http://localhost:3000/manager
Monitoring dashboard: http://localhost:3000/monitoring
The application port can be changed using the PORT environment variable.

Docker Build
Build the Blue image:

docker build --build-arg APP_VERSION=v1 -t zerodown:v1 .
Build the Green image:

docker build --build-arg APP_VERSION=v2 -t zerodown:v2 .
The application container expects its runtime configuration to be supplied through environment variables. PostgreSQL must also be reachable from the container.

Kubernetes Deployment
1. Start Minikube
minikube start --driver=docker --cpus=2 --memory=2048
2. Load the application images
minikube image load zerodown:v1
minikube image load zerodown:v2
3. Deploy Blue and Green environments
minikube kubectl -- apply -f k8s/blue-deployment.yaml
minikube kubectl -- apply -f k8s/green-deployment.yaml
4. Configure the initial Blue traffic route
minikube kubectl -- apply -f k8s/service.yaml
5. Verify the deployments
minikube kubectl -- get deployments
minikube kubectl -- get pods
minikube kubectl -- get services
Blue-Green Deployment and Rollback
Where actual deployment control runs
ZeroDown uses a local-control-plane approach for the Blue-Green Kubernetes demonstration:

The public customer storefront is hosted on Render.
The PostgreSQL database is hosted on Neon.
The Minikube cluster runs locally on the developer's machine.
The local ZeroDown application/manager communicates with that local Minikube cluster to inspect deployments and perform traffic switching.
The public Render manager page cannot reach the laptop's Minikube API. If Kubernetes is unavailable to the hosted service, its deployment values are simulated and its switch/rollback controls are disabled.
This separation is intentional for the current zero-cost demonstration setup. It avoids exposing a developer's local Kubernetes API or creating an unsupported connection from Render to a laptop.

For a live Blue-Green demo: start Docker and Minikube on the laptop, start the application locally with its environment configuration, and open the local manager dashboard at http://localhost:3000/manager. Use that local dashboard for real deployment status and switching. The public Render manager URL remains a hosted status/demo view only.

The project includes a PowerShell script for controlled traffic switching.

Switch to Green:

.\scripts\switch-deployment.ps1 -Target green
Switch to Blue:

.\scripts\switch-deployment.ps1 -Target blue
The script:

Identifies the currently active deployment.
Checks the target deployment's ready replicas.
Aborts if the target is not healthy.
Updates the Kubernetes Service selector.
Starts a temporary port-forward.
Verifies the expected application version.
Attempts to restore the previous route if verification fails.
Application Endpoints
Endpoint	Purpose
/	Customer storefront
/health	Application health
/version	Active application version
/metrics	Prometheus metrics
/manager	Manager dashboard
/monitoring	Monitoring dashboard
The manager dashboard and application APIs include protected operations. Configure manager credentials before use.

Monitoring
ZeroDown exposes Prometheus metrics through /metrics.

The monitoring integration supports visibility into:

HTTP request counts.
Request duration.
Node.js process metrics.
Application health.
Active application version.
Prometheus collects application metrics, while Grafana provides visualization.

Example PromQL queries:

HTTP request rate

sum by (version) (rate(zerodown_http_requests_total[1m]))
Average response time

(rate(zerodown_http_request_duration_seconds_sum[1m]) /
rate(zerodown_http_request_duration_seconds_count[1m])) * 1000
Continuous Integration
The GitHub Actions workflow in .github/workflows/ci.yml performs:

Repository checkout.
Node.js setup.
Dependency installation.
Automated test execution.
Blue Docker image build.
Green Docker image build.
The current workflow runs for pushes to main and pull requests targeting main.

Kubernetes deployment and traffic switching remain separate local operations.

Testing
Run the automated test suite:

npm test
The integrated test suite contains coverage for application routes, authentication, cart and wishlist operations, database behavior, Kubernetes deployment logic, manager operations, orders and products.

Latest local test result: 8 test suites passed, 76 tests passed.

Project Scope and Limitations
The public web application is hosted on Render, with Neon PostgreSQL as its database.
The project demonstrates Blue-Green deployment using a separate local Minikube cluster.
The Render-hosted manager dashboard cannot access the developer's local Minikube cluster; it displays simulated deployment data and disables switching/rollback when Kubernetes is unavailable.
Actual Kubernetes status checks, traffic switching, and rollback are performed from the local application/manager on the same machine as Minikube.
The public manager URL is not a remote Kubernetes control plane.
It does not claim a guaranteed production zero-downtime SLA.
GitHub Actions currently builds and tests the application; it does not automatically deploy to Kubernetes.
Deployment switching and rollback are executed locally using PowerShell.
Checkout is a demonstration flow and does not process real payments.
A production-scale cloud deployment and load-testing evaluation are outside the current implementation scope.
Future Enhancements
Automated Kubernetes deployment through CI/CD.
Cloud Kubernetes integration.
Automated load and performance testing.
Deployment notifications and alerting.
Advanced rollout and traffic-management strategies.
Repository and Live Links
GitHub: https://github.com/JOSESAMUEL14/ZeroDown
Live Storefront: https://zerodown.onrender.com/
Manager Control Plane: https://zerodown.onrender.com/manager
ZeroDown — Safer Releases. Controlled Deployments. Better Visibility.

