# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VCT CN Calendar Subscription 是一个 Node.js 项目，用于生成无畏契约 (VALORANT) 中国赛区电竞比赛的 iCalendar (.ics) 日历订阅文件。通过腾讯官方 API 获取比赛数据，并自动生成可订阅的日历文件。

## Architecture

```
├── index.js              # 主入口文件，包含所有核心逻辑
├── cache/                # API 数据缓存目录（每个有效 ID 一个 .json 文件）
├── vct-cn-alarm.ics      # 生成的日历文件（带提醒）
├── package.json          # 项目依赖配置
└── .github/workflows/
    └── schedule.yml      # GitHub Actions 定时任务（每小时运行）
```

### 核心流程

1. 从腾讯官方 API (`val.native.game.qq.com`) 获取 VCT CN 比赛数据
2. 使用 `ics` 库将比赛数据转换为 iCalendar 格式
3. 生成 `.ics` 文件，包含比赛时间、队伍、比分等信息
4. 通过 GitHub Actions 每小时自动更新并提交

## Common Commands

```bash
# 安装依赖
npm install

# 运行生成日历
npm start
```

## Key Dependencies

- **superagent**: HTTP 请求库，用于获取 API 数据
- **ics**: iCalendar 文件生成库

## Data Source

- API 基地址: `https://val.native.game.qq.com/esports/v1/data/VAL_Match_{ID}.json`
- 文件缓存机制：
  - 每个有效 API ID 保存为独立的 `cache/{ID}.json` 文件
  - 每次运行刷新所有已缓存的 ID，并向后探测 10 个新 ID
  - 请求成功则覆盖缓存文件，失败则使用已有缓存（避免维护期间丢失数据）
- 使用 `bMatchId` 进行去重，避免重复比赛

## Calendar Features

- 每场比赛默认持续时间: 2 小时
- 比赛前 30 分钟音频提醒（针对未结束的比赛）
- 显示队伍名称和比分（如已有结果）
- 时区处理使用 UTC

## Deployment

通过 GitHub Actions 自动化部署:
- 触发条件: 推送到 main 分支 或 每小时定时触发
- 自动提交更新后的 `.ics` 文件

## Subscription URL

用户可通过以下链接订阅日历:
```
https://raw.githubusercontent.com/Ashinch/vct-cn-calendar-subscription/main/vct-cn-alarm.ics
```
