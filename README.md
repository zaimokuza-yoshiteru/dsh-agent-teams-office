# DSH Agent Teams Office

在 DSH 原生右侧边栏中查看 Agent Teams 的办公室。支持 3D / 像素切换、16 个队友工位和 Lead 独立办公室，点击人物可打开对应会话。

## 预览

以下为办公室组件的示例团队截图，不包含真实会话信息。

**3D 视图**

![3D 办公室：16 个队友工位与 Lead 独立办公室](https://raw.githubusercontent.com/zaimokuza-yoshiteru/dsh-agent-teams-office/main/docs/screenshots/office-3d.jpg)

**像素视图**

![像素办公室：工作中的队友与 Lead 独立办公室](https://raw.githubusercontent.com/zaimokuza-yoshiteru/dsh-agent-teams-office/main/docs/screenshots/office-pixel.jpg)

## 安装

需要 **DSH 0.1.6-alpha.1**，并在宿主中启用 Agent Teams。未启用时不会显示办公室入口。

在桌面端的「Desktop Plugins」中安装：

```text
@zaimokuza/dsh-agent-teams-office@beta
```

安装后重启桌面端。CLI 管理的 profile 可使用：

```bash
dsh plugin --profile <profile-name> add @zaimokuza/dsh-agent-teams-office@beta
```

## 使用

1. 打开团队会话，在右侧边栏新增「办公室」标签。
2. 切换 3D / 像素视图；「全景」恢复镜头，选中成员后可聚焦或查看会话。
3. 工作中的成员回到工位，空闲成员自由活动。真实消息与任务事件触发拜访、交接、讨论和完成动画。

动画不调用模型，也不会创建消息或任务。打开视图时不回放历史事件。插件最多展示 16 个 teammate 和 1 个 Lead，不修改宿主的人数配置；更多成员仍可在原生 Team 面板中查看。

## 兼容性

首版为 **Beta**，已在 macOS 桌面端验证，适合个人和内部试用。其他系统、其他 DSH 版本及长时间运行仍需验证。宿主需要 Node.js 22.19+（22.x）或 24+，图形环境需支持 WebGL。

卸载请使用桌面端插件管理；CLI profile 可运行 `dsh plugin --profile <profile-name> remove @zaimokuza/dsh-agent-teams-office`。

## 许可证

项目代码与原创场景素材采用 [MIT](LICENSE)。复用代码及渲染库的许可见 [第三方声明](THIRD_PARTY_NOTICES.md)。
