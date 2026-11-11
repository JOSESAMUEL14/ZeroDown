# ZeroDown — Zero-Downtime Deployment Platform

**Experience Blue-Green deployments, traffic switching, health verification, and rollback through a containerized application.**

[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?logo=github)](https://github.com/JOSESAMUEL14/ZeroDown)
[![Live Demo](https://img.shields.io/badge/Live-Demo-success)](https://zerodown.onrender.com/)
[![Node.js](https://img.shields.io/badge/Node.js-Backend-green?logo=node.js)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Containerization-blue?logo=docker)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Orchestration-326CE5?logo=kubernetes)](https://kubernetes.io/)

## 🚀 Try ZeroDown

Explore the hosted application:

| Component | Link |
|---|---|
| 🛍️ Customer Storefront | [Open Live Storefront](https://zerodown.onrender.com/) |
| ⚙️ Manager Dashboard | [Open Manager Dashboard](https://zerodown.onrender.com/manager) |
| 💻 Source Code | [GitHub Repository](https://github.com/JOSESAMUEL14/ZeroDown) |

**Note:** The hosted Render deployment provides access to the application and dashboard interface. Actual Blue-Green traffic switching against a Kubernetes cluster is demonstrated in the local Minikube environment; the hosted manager is not connected to that local cluster.

---

## 📌 About the Project

ZeroDown is a containerized application designed to demonstrate **zero-downtime deployment strategies** using Blue-Green deployment architecture.

Traditional application deployments can cause downtime, service interruptions, and deployment risks. ZeroDown addresses these challenges by maintaining two separate application environments — Blue and Green — and switching traffic between them through a Kubernetes Service.

The project demonstrates how deployment automation, health checks, traffic management, and rollback mechanisms can improve application availability and deployment reliability.

## ✨ Key Features

- **Blue-Green Deployment:** Maintain two independent application versions.
- **Traffic Switching:** Route customer requests between Blue and Green environments.
- **Health Verification:** Check deployment readiness before switching traffic.
- **Automatic Rollback:** Restore the previous deployment if verification fails.
- **Manager Dashboard:** Manage deployments and inspect cluster status.
- **Customer Storefront:** Access the application through a consistent customer endpoint.
- **Containerization:** Package the application using Docker.
- **Kubernetes Orchestration:** Manage application deployments, pods, and Services.
- **Monitoring Support:** Project monitoring interface and observability components.

## 🏗️ Architecture

```text
                  Manager Dashboard
                         |
                         v
                 Deployment Manager
                         |
                         v
                  Kubernetes Service
                         |
              +----------+----------+
              |                     |
              v                     v
        BLUE DEPLOYMENT       GREEN DEPLOYMENT
           Version 1             Version 2
          2 Replicas             2 Replicas
              |                     |
              +----------+----------+
                         |
                         v
                  Customer Storefront
```

The Kubernetes Service selector determines which deployment receives customer traffic. Switching the selector changes the active application version without requiring customers to use a different application URL.

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Containerization | Docker |
| Orchestration | Kubernetes, Minikube |
| CI/CD | GitHub Actions |
| Testing | Jest |
| Deployment Automation | PowerShell |
| Monitoring | Prometheus, Grafana |

## 🔄 Blue-Green Deployment Workflow

1. Deploy both Blue and Green application environments.
2. Verify that the target deployment has healthy, ready replicas.
3. Select the target environment from the Manager Dashboard.
4. Update the Kubernetes Service selector.
5. Verify that customer requests reach the expected application version.
6. Roll back to the previous deployment when necessary.

## 💻 Local Development

### Prerequisites

- Node.js
- npm
- Docker Desktop
- Minikube
- kubectl

### Clone the Repository

```bash
git clone https://github.com/JOSESAMUEL14/ZeroDown.git
cd ZeroDown
```

### Install Dependencies

```bash
npm install
```

### Configure Environment

Create your local `.env` file using `.env.example` as a reference.

**Never commit `.env` files, database credentials, API keys, or JWT secrets.**

### Start the Application

```bash
node server.js
```

Open the local manager dashboard:

```text
http://localhost:3000/manager
```

### Run Tests

```bash
npm test
```

### Kubernetes Demonstration

The repository includes Kubernetes manifests for the Blue and Green deployments and their corresponding Service configurations.

The local demonstration uses Minikube to run both deployments and verify real traffic switching.

**Local customer access:** The customer gateway runs through a local Minikube service tunnel and Node.js proxy. It requires the local cluster and proxy to remain running and is not a public Internet URL.

## 📊 Project Objectives

- Demonstrate zero-downtime deployment concepts.
- Reduce deployment-related service interruptions.
- Implement automated deployment health verification.
- Demonstrate traffic switching through Kubernetes Services.
- Provide a rollback mechanism for deployment failures.
- Explore container orchestration and monitoring.

## 🔮 Future Enhancements

- Automated predictive deployment strategies.
- Advanced deployment analytics.
- Enhanced observability and alerting.
- Cloud Kubernetes integration.
- Automated failure detection and recovery.

## 👨‍💻 Author

**Samuel D**

B.E. Computer Science and Engineering

Interested in Cloud Engineering, DevOps, Kubernetes, and Cloud Architecture.

- GitHub: [JOSESAMUEL14](https://github.com/JOSESAMUEL14)
- Project: [ZeroDown](https://github.com/JOSESAMUEL14/ZeroDown)

---

⭐ If you find this project interesting, consider giving the repository a star!
