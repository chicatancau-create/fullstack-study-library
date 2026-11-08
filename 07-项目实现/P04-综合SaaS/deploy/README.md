# Docker / Kubernetes 隔离 VM 演练（2026-11-07）

用 QEMU 11.1.0 + Ubuntu 24.04 cloud image 在**本机隔离 VM**中验证容器与 K8s；
不改主机、不需要 WSL/重启。QEMU 走 TCG 软件模拟，性能不代表真实集群。

## 文件

- `cloud-init-user-data.yaml`：安装 Docker、Compose、K3s，部署 web 工作负载，做 Pod 故障与回滚。
- `cloud-init-meta-data.yaml`：NoCloud instance-id。
- `k8s-web.yaml`：Deployment（2 副本、readiness/liveness、ConfigMap）+ NodePort Service。
- `evidence/docker-k8s.txt`：多次运行的筛选原始输出（含失败与成功）。

## 复现（摘要）

1. 下载 Ubuntu cloud image，`qemu-img create -b` 生成 12G 覆盖盘。
2. 用 pycdlib 把 `user-data`/`meta-data` 打成卷标 `cidata` 的 ISO。
3. 启动：`qemu-system-x86_64 -accel tcg,thread=multi -m 3072 -smp 2 -drive file=disk.qcow2,if=virtio -drive file=seed.iso,media=cdrom -netdev user,id=n0 -device virtio-net-pci,netdev=n0 -nographic -no-reboot`。
4. cloud-init 从 `/dev/sr0` 读取配置并执行，串口输出即证据。

## 实测结果

- Docker Engine 29.1.3：`nginx:1.27-alpine` 拉取、容器 `Up`、`curl :8080` 返回 HTML。
- Docker Compose v2.40.3：`docker compose up -d` 启动 `tmp-web-1`，`curl :8081` 返回 HTML，随后 `down`。
- K3s v1.37.2：节点 Ready；`kubectl apply` 创建 ConfigMap/Deployment/Service；
  Deployment **successfully rolled out**，2/2 Pod `Running`；删除两个 Pod 后重建为 2/2 `Running`。
- 回滚：早期运行因镜像未变更返回 `no rollout history`；后续用单平台镜像导入 + `rollout restart` 产生 revision，
  `rollout undo` 成功，最终 `successfully rolled out`（见证据 run9）。
- 换镜像滚动更新在 TCG 下拉取会超时；改用预导入单平台镜像 + `rollout restart` 后，滚动更新与 undo 均成功。
- 单平台镜像导入 `k8s.io` 后，2/2 Pod Running，`rollout restart` 与 `rollout undo` 均 `successfully rolled out`。

## 边界

- QEMU TCG、K3s 两节点（server + agent 容器在同一 VM）；Ingress 已用 Traefik 验证；无多机/HA/LoadBalancer/公网；不代表生产 K8s。
- Docker Hub 直连在 guest 内超时，需给 dockerd 配代理（示例用 host 10.0.2.2:7897）。
- 单节点 Ingress 已用 Traefik 验证：`Host: web.local` 经 Ingress 返回 nginx 页面（见 `evidence/ingress.txt`、`k8s-ingress.yaml`）。
- 两节点：`agent-1` 以特权容器加入 `k8s-lab`，`agent-pause` Pod 调度到 `agent-1` 并 Running；见 `evidence/multinode.txt`。仍不是多机/HA。
- 告警用 Prometheus 3.5.0 + Alertmanager 0.28.1 本地 webhook 演练（见 `evidence/prometheus.txt`、`evidence/alertmanager.txt`）；另用 ntfy.sh 公共 topic 验证外部投递（见 `evidence/alertmanager-external.txt`，合成告警、无凭据）。
- 2026-11-08 首轮 cloud-init Ingress 失败（`runcmd` 未执行，记录见 `evidence/ingress-attempt-2026-11-08.txt`）；随后通过串口登录手动安装 K3s/Traefik 并完成 Ingress 验证。
- 复现时 K3s 安装脚本有一次被 GitHub 连接重置中断，说明该演练依赖外网可达性；失败要重跑，不能把“脚本继续执行”当成功。
