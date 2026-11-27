window.STUDENT_APP_ONLINE_VERSIONS = {
  "schemaVersion": 1,
  "projectId": "victor-student-app-new-demo-261126-1035",
  "projectName": "学生端 APP Demo",
  "versions": [
    {
      "id": "student-app-v16-261127-1612",
      "version": "V16",
      "name": "案例分组与任务正答率规则修正版",
      "generatedAt": "2026-11-27T16:12:00+08:00",
      "generatedLabel": "2026-11-27 16:12",
      "baseline": "本地 V15 · 261127_1503",
      "entry": "v16_261127_1612/index.html",
      "workbench": "v16_261127_1612/workbench_261126_1035.html",
      "caseCount": 528,
      "caseSummary": "49 组任务 · 528 套去重案例 · 含 248 个存稿案例",
      "statusLabel": "Pages 已部署，浏览器待验收",
      "summary": "发布本地 V16 的独立副本，按任务配置与状态归组案例，保留旧版入口；学生代码与素材保持原样，仅调整两处外部管理页的版本中心链接。",
      "updates": [
        {
          "before": "V15 案例存在相同任务设定分散和重复的情况。",
          "after": "V16 按任务配置与状态归组并重编号，提供配套案例清单及旧新编号对照。"
        },
        {
          "before": "任务正答率口径及案例说明需要调整。",
          "after": "任务正答率仅汇总曾经达标套题的最新一次成功提交结果；最新一次未达标仍采用最新结果。"
        },
        {
          "before": "存在全部套题达标后公布的案例表述。",
          "after": "任务完成与答案公布分开：所有套题曾经达标才算完成，完成状态不作为额外公布设置。"
        },
        {
          "before": "截止前无成功作答记录时仍可能出现正答率占位标签。",
          "after": "截止前无记录不显示正答率标签；截止后且答案已公布才显示正答率--。"
        }
      ],
      "verification": [
        "V16 产品提交 45d4007a067f8c2d7cc655695d50663f73832d83 对应 GitHub Pages 运行 45974120337 已成功。",
        "本次发布的 94 个文件已与本地发布副本逐一核对 Git blob SHA1 和文件大小，差异为 0。",
        "此前 177 个线上文件逐项校验未改动；本次版本中心登记随后增量追加 V16。",
        "浏览器点击、音频播放和设备体验未实测；Pages 构建不代表业务验收通过。",
        "本地工作环境在上传末期断开；本地规范索引的部署登记和完整公共清单同步尚待连接恢复。"
      ],
      "online": {
        "repositoryUrl": "https://github.com/bulingbulinggogogo/victor-student-app-v3-261126",
        "branch": "main",
        "commit": "45d4007a067f8c2d7cc655695d50663f73832d83",
        "runUrl": "https://github.com/bulingbulinggogogo/victor-student-app-v3-261126/actions/runs/45974120337",
        "browserVerified": false,
        "audioVerified": false,
        "deployedAt": "2026-11-27T09:30:03Z",
        "deployed": true
      }
    },
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
