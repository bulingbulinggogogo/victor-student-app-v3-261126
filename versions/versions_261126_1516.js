window.STUDENT_APP_ONLINE_VERSIONS = {
  "schemaVersion": 1,
  "projectId": "victor-student-app-new-demo-261126-1035",
  "projectName": "学生端 APP Demo",
  "versions": [
    {
      "id": "student-app-v4-261126-1516",
      "version": "V4",
      "name": "多状态任务与套题版",
      "generatedAt": "2026-11-26T15:16:00+08:00",
      "generatedLabel": "2026-11-26 15:16",
      "baseline": "已上线 V3 · 261126_1240",
      "entry": "v4_261126_1516/index.html",
      "workbench": "v4_261126_1516/workbench_261126_1035.html",
      "caseCount": 38,
      "caseSummary": "38 种状态 · 默认任务并存，套题分别保存记录",
      "statusLabel": "浏览器待验收",
      "summary": "保留原学生页面与作答规则，把状态案例做成默认任务列表中的具名任务和套题，可直接找到“补交后仍未达标”等示例。任务控制工作台继续提供配置和演示辅助。",
      "updates": [
        {
          "before": "状态案例主要通过工作台逐个切换，默认任务列表不同时呈现全部案例。",
          "after": "默认任务与套题中增加 38 种具名状态案例，可在学生 Demo 内直接浏览不同状态。"
        },
        {
          "before": "案例定位依赖外部工作台。",
          "after": "学生 Demo 增加小型状态案例目录，支持搜索、定位和恢复单个案例；其他任务记录继续保留。"
        },
        {
          "before": "尚未到可见时间的任务通过独立案例验证。",
          "after": "任务继续遵守真实隐藏规则，可从案例目录定位并验证限制。"
        },
        {
          "before": "线上版本中心为 V3 的轻量单版本入口。",
          "after": "版本中心收录 V4 与 V3，提供搜索、详情、两类页面入口和链接复制，保留 V3 原入口。"
        }
      ],
      "verification": [
        "86项离线行为回归通过：状态模型、页面集成、播放函数、消息来源及默认案例共存。",
        "默认目录包含42个任务与66套题，38个具名案例；真实浏览器、声音和设备待验收。",
        "V3原站入口及记录保留，V4使用独立数据空间与入口。"
      ]
    },
    {
      "id": "student-app-v3-261126-1240",
      "version": "V3",
      "name": "GitHub 静态发布适配版",
      "generatedAt": "2026-11-26T12:40:00+08:00",
      "generatedLabel": "2026-11-26 12:40",
      "baseline": "V2 考试播放恢复修复版 · 261126_1216",
      "entry": "../index.html",
      "workbench": "../workbench_261126_1035.html",
      "caseCount": 38,
      "caseSummary": "38 个工作台案例 · 切换案例保留各自记录",
      "statusLabel": "浏览器待验收",
      "summary": "已上线的 V3 仍保留在站点根目录。学生页面、听力素材及原工作台入口继续可选，便于与新版对照。",
      "updates": [
        {
          "before": "V2 主要通过本地版本中心打开。",
          "after": "V3 提供 GitHub Pages 静态站点和同源任务控制工作台。"
        },
        {
          "before": "工作台部分提示针对本机环境。",
          "after": "兼容在线入口和同源消息，说明演示配置只在当前浏览器保存。"
        }
      ],
      "verification": [
        "87 个已发布文件与实际本地发布副本的 Git blob SHA1 和大小全部一致，缺失、多余和变化均为 0。",
        "main 提交 bcf7509c63d829c14dc26d49509adf7249ef201c 对应的 GitHub Pages 运行已成功。",
        "真实浏览器布局、点击、工作台联动、音频声音及设备体验尚未验收。"
      ]
    }
  ]
};
