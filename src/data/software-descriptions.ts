export interface BuiltinDescriptionEntry {
  names: string[];
  bundleIds?: string[];
  description: string;
}

const BUILTIN_DESCRIPTIONS: BuiltinDescriptionEntry[] = [
  {
    names: ['Visual Studio Code', 'VS Code', 'Code'],
    bundleIds: ['com.microsoft.VSCode'],
    description: '轻量级代码编辑器，支持智能补全、调试、Git 集成与海量扩展插件，是前端与全栈开发的首选工具。',
  },
  {
    names: ['Xcode'],
    bundleIds: ['com.apple.dt.Xcode'],
    description: 'Apple 官方集成开发环境，用于开发 iOS、macOS、watchOS 和 visionOS 应用，内置 Interface Builder 与 Swift 编译器。',
  },
  {
    names: ['Android Studio'],
    bundleIds: ['com.google.android.studio'],
    description: 'Google 官方 Android 开发 IDE，基于 IntelliJ IDEA，提供模拟器、布局编辑器和 Gradle 构建支持。',
  },
  {
    names: ['IntelliJ IDEA'],
    bundleIds: ['com.jetbrains.intellij'],
    description: 'JetBrains 出品的 Java/Kotlin 旗舰 IDE，深度支持 Spring、Maven、Gradle 生态，智能重构能力业界领先。',
  },
  {
    names: ['PyCharm'],
    bundleIds: ['com.jetbrains.pycharm'],
    description: 'JetBrains 专为 Python 开发的 IDE，内置 Django/Flask 支持、Jupyter Notebook 集成与科学计算工具链。',
  },
  {
    names: ['WebStorm'],
    bundleIds: ['com.jetbrains.webstorm'],
    description: 'JetBrains 前端开发 IDE，深度支持 React、Vue、Angular、TypeScript，提供智能代码分析与重构。',
  },
  {
    names: ['GoLand'],
    bundleIds: ['com.jetbrains.goland'],
    description: 'JetBrains 专为 Go 语言打造的 IDE，内置 Delve 调试器、测试运行器与微服务开发支持。',
  },
  {
    names: ['CLion'],
    bundleIds: ['com.jetbrains.clion'],
    description: 'JetBrains C/C++ 跨平台 IDE，支持 CMake、Makefile、GDB/LLDB 调试，适合嵌入式与系统级开发。',
  },
  {
    names: ['Cursor'],
    bundleIds: ['com.todesktop.230313mzl4w4u92'],
    description: 'AI 原生代码编辑器，基于 VS Code 构建，内置 GPT-4 级代码补全、智能重构与自然语言编程能力。',
  },
  {
    names: ['Zed'],
    bundleIds: ['dev.zed.Zed'],
    description: '新一代高性能代码编辑器，采用 Rust 编写，强调极致响应速度与多人实时协作编辑体验。',
  },
  {
    names: ['Sublime Text'],
    bundleIds: ['com.sublimetext.4', 'com.sublimetext.3'],
    description: '以极速启动和流畅编辑著称的文本编辑器，支持多行编辑、Goto Anything 和丰富的插件生态。',
  },
  {
    names: ['Terminal', 'iTerm', 'iTerm2'],
    bundleIds: ['com.apple.Terminal', 'com.googlecode.iterm2'],
    description: '命令行终端工具，用于执行 Shell 脚本、管理服务器、运行开发命令和自动化工作流。',
  },
  {
    names: ['Warp'],
    bundleIds: ['dev.warp.Warp-Stable'],
    description: '现代 AI 驱动终端，将命令行输入区改造为编辑器体验，支持 AI 命令提示、块编辑与团队协作。',
  },
  {
    names: ['Docker Desktop'],
    bundleIds: ['com.docker.docker'],
    description: '容器化应用开发与部署平台，通过 Docker 镜像实现环境一致性，支持 Kubernetes 编排与本地集群。',
  },
  {
    names: ['Postman'],
    bundleIds: ['com.postmanlabs.mac'],
    description: 'API 开发与测试工具，支持 REST、GraphQL、WebSocket 请求的构建、发送、自动化测试与文档生成。',
  },
  {
    names: ['TablePlus'],
    bundleIds: ['com.tinyapp.TablePlus'],
    description: '现代化数据库管理 GUI 工具，支持 MySQL、PostgreSQL、SQLite、MongoDB 等，界面简洁、连接快速。',
  },
  {
    names: ['Sourcetree', 'Fork', 'Tower'],
    bundleIds: ['com.torusknot.SourceTreeNotMAS', 'com.DanPristupov.Fork', 'com.fournova.Tower3'],
    description: '图形化 Git 版本控制客户端，直观展示分支、合并、提交历史，降低 Git 学习门槛。',
  },
  {
    names: ['Chrome', 'Google Chrome'],
    bundleIds: ['com.google.Chrome'],
    description: 'Google 开发的高速浏览器，基于 Chromium 内核，拥有丰富的扩展生态和强大的开发者工具。',
  },
  {
    names: ['Safari'],
    bundleIds: ['com.apple.Safari'],
    description: 'Apple 原生浏览器，深度集成 macOS/iOS 生态，以能效优化和隐私保护著称，支持标签页组与阅读列表。',
  },
  {
    names: ['Firefox'],
    bundleIds: ['org.mozilla.firefox'],
    description: 'Mozilla 开源浏览器，强调隐私保护与开放标准，支持海量扩展，Gecko 引擎独立渲染网页。',
  },
  {
    names: ['Arc'],
    bundleIds: ['company.thebrowser.Browser'],
    description: '颠覆传统的现代浏览器，以 Spaces 组织网页、侧边标签栏和自动归档未用标签重新定义浏览体验。',
  },
  {
    names: ['Brave'],
    bundleIds: ['com.brave.Browser'],
    description: '隐私优先的 Chromium 浏览器，内置广告拦截、追踪保护和 Brave Rewards，支持 Tor 隐私浏览模式。',
  },
  {
    names: ['Edge', 'Microsoft Edge'],
    bundleIds: ['com.microsoft.edgemac'],
    description: '微软基于 Chromium 的浏览器，深度集成 Copilot AI、Office 365 和云同步，支持垂直标签页与睡眠标签。',
  },
  {
    names: ['Figma'],
    bundleIds: ['com.figma.Desktop'],
    description: '基于浏览器的矢量界面设计工具，支持多人实时协作、组件系统、原型交互与开发者交付。',
  },
  {
    names: ['Sketch'],
    bundleIds: ['com.bohemiancoding.sketch3'],
    description: 'macOS 原生矢量设计工具，专注 UI/UX 设计，以简洁的组件系统和 Symbols 复用机制著称。',
  },
  {
    names: ['Photoshop', 'Adobe Photoshop'],
    bundleIds: ['com.adobe.Photoshop'],
    description: 'Adobe 图像处理行业标准软件，支持图层编辑、蒙版、调色、修图与 AI 生成式填充（Firefly）。',
  },
  {
    names: ['Illustrator', 'Adobe Illustrator'],
    bundleIds: ['com.adobe.Illustrator'],
    description: 'Adobe 矢量图形设计软件，用于 Logo、图标、插画和排版设计，支持精准路径与色彩管理。',
  },
  {
    names: ['Premiere Pro', 'Adobe Premiere Pro'],
    bundleIds: ['com.adobe.PremierePro.25'],
    description: 'Adobe 专业视频剪辑软件，支持多机位编辑、色彩校正、音频混音与多种格式导出。',
  },
  {
    names: ['After Effects', 'Adobe After Effects'],
    bundleIds: ['com.adobe.AfterEffects'],
    description: 'Adobe 动态图形与视觉特效合成软件，用于片头动画、MG 动画、绿幕抠像与影视后期特效。',
  },
  {
    names: ['Blender'],
    bundleIds: ['org.blenderfoundation.blender'],
    description: '开源全能 3D 创作套件，覆盖建模、雕刻、动画、渲染、合成与视频剪辑，完全免费。',
  },
  {
    names: ['Notion'],
    bundleIds: ['notion.id'],
    description: 'All-in-one 知识管理与协作平台，融合笔记、数据库、看板、Wiki 与项目管理于一体。',
  },
  {
    names: ['Obsidian'],
    bundleIds: ['md.obsidian'],
    description: '基于本地 Markdown 文件的知识库工具，以双向链接图谱和丰富插件生态构建第二大脑。',
  },
  {
    names: ['Things'],
    bundleIds: ['com.culturedcode.thingsmac'],
    description: 'Apple Design Award 获奖待办事项管理应用，以优雅的界面设计和强大的标签、区域组织著称。',
  },
  {
    names: ['Microsoft Word', 'Word'],
    bundleIds: ['com.microsoft.Word'],
    description: '微软旗舰文字处理软件，提供丰富的排版、审阅、协作与模板功能，办公文档行业标准。',
  },
  {
    names: ['Microsoft Excel', 'Excel'],
    bundleIds: ['com.microsoft.Excel'],
    description: '微软电子表格软件，支持公式计算、数据透视表、图表可视化与 Power Query 数据清洗。',
  },
  {
    names: ['Microsoft PowerPoint', 'PowerPoint'],
    bundleIds: ['com.microsoft.Powerpoint'],
    description: '微软演示文稿软件，提供丰富的动画、过渡效果、母版设计与实时协作演示功能。',
  },
  {
    names: ['Keynote'],
    bundleIds: ['com.apple.iWork.Keynote'],
    description: 'Apple 原生演示软件，以精美的主题模板、流畅的动画效果和与 iOS 生态无缝协作著称。',
  },
  {
    names: ['Pages'],
    bundleIds: ['com.apple.iWork.Pages'],
    description: 'Apple 原生文字处理软件，界面简洁优雅，适合图文混排、海报设计与电子书制作。',
  },
  {
    names: ['Numbers'],
    bundleIds: ['com.apple.iWork.Numbers'],
    description: 'Apple 原生电子表格软件，以直观的公式面板和精美的图表样式降低数据处理门槛。',
  },
  {
    names: ['WeChat', '微信'],
    bundleIds: ['com.tencent.xin', 'com.tencent.wechat'],
    description: '腾讯旗下即时通讯与社交平台，支持文字、语音、视频通话、朋友圈、小程序与支付功能。',
  },
  {
    names: ['Slack'],
    bundleIds: ['com.tinyspeck.slackmacgap'],
    description: '企业级团队通讯协作平台，以频道组织对话、集成数千款第三方应用和强大的搜索著称。',
  },
  {
    names: ['Discord'],
    bundleIds: ['com.hnc.discord'],
    description: '面向游戏社区与兴趣群体的语音文字通讯平台，支持服务器、频道、机器人与屏幕共享。',
  },
  {
    names: ['Telegram'],
    bundleIds: ['ru.keepcoder.Telegram'],
    description: '以安全性和速度著称的即时通讯应用，支持端到端加密、超大群组、频道订阅与 Bot 生态。',
  },
  {
    names: ['Zoom'],
    bundleIds: ['us.zoom.xos'],
    description: '视频会议与在线协作平台，支持高清音视频、屏幕共享、虚拟背景、breakout rooms 与 webinar。',
  },
  {
    names: ['Lark', '飞书'],
    bundleIds: ['com.electron.lark', 'com.bytedance.lark'],
    description: '字节跳动出品的一站式企业协作平台，融合即时通讯、文档、日历、会议与多维表格。',
  },
  {
    names: ['钉钉', 'DingTalk'],
    bundleIds: ['com.alibaba.DingTalkMac'],
    description: '阿里巴巴企业智能移动办公平台，提供考勤、审批、日程、文档与视频会议等企业级功能。',
  },
  {
    names: ['Spotify'],
    bundleIds: ['com.spotify.client'],
    description: '全球最大流媒体音乐平台，提供千万级曲库、个性化推荐、播客与多设备无缝同步播放。',
  },
  {
    names: ['VLC'],
    bundleIds: ['org.videolan.vlc'],
    description: '开源万能媒体播放器，支持几乎所有音视频格式与编解码器，无需额外安装解码包。',
  },
  {
    names: ['网易云音乐'],
    bundleIds: ['com.netease.163music'],
    description: '网易出品音乐流媒体平台，以精准个性化推荐、高质量乐评社区与独家版权曲库著称。',
  },
  {
    names: ['IINA'],
    bundleIds: ['com.colliderli.iina'],
    description: 'macOS 现代化开源视频播放器，基于 mpv，支持画中画、触控板手势、在线字幕下载与深色模式。',
  },
  {
    names: ['1Password'],
    bundleIds: ['com.1password.1password'],
    description: '密码管理器，安全存储密码、信用卡、密钥与敏感文档，支持生物识别解锁与跨设备同步。',
  },
  {
    names: ['Bitwarden'],
    bundleIds: ['com.bitwarden.desktop'],
    description: '开源密码管理器，提供端到端加密、自托管选项与跨平台同步，个人版完全免费。',
  },
  {
    names: ['Clash'],
    bundleIds: ['com.west2online.ClashX', 'com.west2online.ClashXPro'],
    description: '基于规则的网络代理工具，支持多种代理协议与分流规则，用于科学上网与网络流量管理。',
  },
  {
    names: ['Surge'],
    bundleIds: ['com.nssurge.surge-mac'],
    description: '高级网络调试与代理工具，支持 HTTP/HTTPS/SOCKS5 代理、MitM、脚本改写与网络性能分析。',
  },
  {
    names: ['Raycast'],
    bundleIds: ['com.raycast.macos'],
    description: 'macOS 现代启动器与效率工具，替代 Spotlight，支持插件扩展、剪贴板历史、窗口管理与 AI 命令。',
  },
  {
    names: ['Alfred'],
    bundleIds: ['com.runningwithcrayons.Alfred'],
    description: 'macOS 老牌效率启动器，通过 Powerpack 解锁 Workflows、剪贴板历史、文件搜索与系统控制。',
  },
  {
    names: ['CleanMyMac'],
    bundleIds: ['com.macpaw.CleanMyMac4'],
    description: 'macOS 系统清理与优化工具，智能扫描垃圾文件、恶意软件与系统漏洞，释放磁盘空间。',
  },
  {
    names: ['Rectangle'],
    bundleIds: ['com.knollsoft.Rectangle'],
    description: '开源 macOS 窗口管理工具，通过快捷键将窗口快速调整为半屏、三分之一屏或自定义布局。',
  },
  {
    names: ['Keka'],
    bundleIds: ['com.aone.keka'],
    description: 'macOS 开源压缩解压工具，支持 7z、RAR、ZIP、Tar 等主流格式，可创建加密压缩包。',
  },
  {
    names: ['Typora'],
    bundleIds: ['abnerworks.Typora'],
    description: '所见即所得 Markdown 编辑器，实时渲染排版效果，支持数学公式、图表、目录与多种导出格式。',
  },
  {
    names: ['Bear'],
    bundleIds: ['net.shinyfrog.bear'],
    description: '优雅的 macOS/iOS 笔记应用，以 Markdown 写作、标签组织和端到端加密同步为核心特色。',
  },
  {
    names: ['Craft'],
    bundleIds: ['io.craft.docs'],
    description: '现代文档与笔记工具，以块级编辑、精美排版、双向链接和实时协作为核心设计理念。',
  },
  {
    names: ['XMind'],
    bundleIds: ['net.xmind.v2'],
    description: '思维导图与头脑风暴工具，支持多种导图结构、大纲模式、演说模式与团队协作编辑。',
  },
  {
    names: ['Anki'],
    bundleIds: ['net.ankiweb.dtop'],
    description: '基于间隔重复算法的记忆卡片软件，利用艾宾浩斯遗忘曲线帮助高效记忆语言、医学、法律等知识。',
  },
  {
    names: ['Final Cut Pro'],
    bundleIds: ['com.apple.FinalCut'],
    description: 'Apple 专业视频剪辑软件，基于 Magnetic Timeline 的磁性时间线，针对 Apple Silicon 深度优化。',
  },
  {
    names: ['Logic Pro'],
    bundleIds: ['com.apple.logic10'],
    description: 'Apple 专业音乐制作软件，提供海量虚拟乐器、音频插件与编曲工具，是音乐人的主力 DAW。',
  },
  {
    names: ['Linear'],
    bundleIds: ['com.linear'],
    description: '现代 issue 跟踪与项目管理工具，以极速响应、键盘优先的交互和优雅的界面设计著称。',
  },
  {
    names: ['Parallels Desktop'],
    bundleIds: ['com.parallels.desktop.console'],
    description: 'macOS 虚拟机软件，在 Mac 上无缝运行 Windows、Linux 等系统，支持 Coherence 融合模式。',
  },
  {
    names: ['Transmit'],
    bundleIds: ['com.panic.Transmit4'],
    description: 'macOS 经典 FTP/SFTP/Amazon S3 文件传输客户端，以稳定可靠和直观的双栏界面著称。',
  },
  {
    names: ['iStat Menus'],
    bundleIds: ['com.bjango.istatmenus6'],
    description: 'macOS 系统监控工具，在菜单栏实时展示 CPU、内存、磁盘、网络、传感器等硬件状态。',
  },
  {
    names: ['Bartender'],
    bundleIds: ['com.surteesstudios.Bartender'],
    description: 'macOS 菜单栏图标管理工具，可隐藏、折叠或整理菜单栏图标，保持桌面整洁。',
  },
  {
    names: ['Karabiner-Elements', 'Karabiner Elements'],
    bundleIds: ['org.pqrs.Karabiner-Elements.Settings'],
    description: 'macOS 键盘自定义工具，可重新映射按键、创建复杂修饰键组合与层切换，提升输入效率。',
  },
  {
    names: ['The Unarchiver'],
    bundleIds: ['cx.c3.theunarchiver'],
    description: 'macOS 免费解压缩工具，支持众多罕见压缩格式，解压时保持文件元数据和编码正确。',
  },
  {
    names: ['HandBrake'],
    bundleIds: ['fr.handbrake.HandBrake'],
    description: '开源视频转码工具，支持将视频转换为 MP4/MKV 等格式，内置预设模板适配手机与流媒体。',
  },
  {
    names: ['DevUtils'],
    bundleIds: ['com.devutils.app'],
    description: '开发者实用工具箱，集成 JSON 格式化、Base64 编解码、正则测试、JWT 解析等常用开发小工具。',
  },
  {
    names: ['Dash'],
    bundleIds: ['com.kapeli.dashdoc'],
    description: 'macOS API 文档浏览器与代码片段管理器，支持 200+ 技术文档离线查阅与快速搜索。',
  },
  {
    names: ['Navicat'],
    bundleIds: ['com.navicat.NavicatPremium'],
    description: '多数据库管理 GUI 工具，支持 MySQL、PostgreSQL、Oracle、SQL Server 等，提供数据传输与同步。',
  },
  {
    names: ['Proxyman'],
    bundleIds: ['com.proxyman.NSProxy'],
    description: '现代 HTTP/HTTPS 网络调试代理工具，拦截、检查、修改请求与响应，支持 Map Local 与断点。',
  },
  {
    names: ['Charles'],
    bundleIds: ['com.xk72.Charles'],
    description: 'HTTP/HTTPS 网络调试代理工具，广泛用于移动应用与 Web 开发中的 API 抓包与流量分析。',
  },
  {
    names: ['ScreenFlow'],
    bundleIds: ['net.telestream.screenflow10'],
    description: 'macOS 屏幕录制与视频编辑软件，以高质量录屏、鼠标高亮和内置剪辑功能著称。',
  },
  {
    names: ['Little Snitch'],
    bundleIds: ['at.obdev.LittleSnitch'],
    description: 'macOS 网络防火墙与流量监控工具，实时拦截应用网络请求，保护隐私与数据安全。',
  },
  {
    names: ['Paste'],
    bundleIds: ['com.wiheads.paste'],
    description: 'macOS 剪贴板历史管理工具，支持文本、图片、文件的多项历史记录、搜索与云同步。',
  },
  {
    names: ['BetterTouchTool'],
    bundleIds: ['com.hegenberg.BetterTouchTool'],
    description: 'macOS 高级输入设备定制工具，可为触控板、鼠标、键盘创建复杂手势与快捷操作。',
  },
  {
    names: ['Downie'],
    bundleIds: ['com.charliemonroe.Downie-4'],
    description: 'macOS 在线视频下载工具，支持 1000+ 视频网站，自动提取最高画质并合并音画。',
  },
  {
    names: ['Permute'],
    bundleIds: ['com.charliemonroe.Permute-3'],
    description: 'macOS 媒体格式转换工具，支持视频、音频、图片的批量转换，拖拽操作、界面简洁。',
  },
  {
    names: ['Hazel'],
    bundleIds: ['com.noodlesoft.Hazel'],
    description: 'macOS 文件自动化管理工具，通过规则自动整理、重命名、移动、删除和归档文件。',
  },
  {
    names: ['Drafts'],
    bundleIds: ['com.agiletortoise.Drafts-OSX'],
    description: '快速笔记捕捉工具，打开即写，支持丰富的文本处理动作和自动化工作流，是想法的第一站。',
  },
  {
    names: ['Trello'],
    bundleIds: ['com.atlassian.trello'],
    description: '看板式项目管理工具，以卡片、列表和看板组织任务，适合敏捷团队与个人工作流。',
  },
  {
    names: ['Asana'],
    bundleIds: ['com.asana.Asana'],
    description: '团队协作与项目管理平台，支持任务分配、时间线、看板、甘特图与自动化规则。',
  },
  {
    names: ['Notability'],
    bundleIds: ['com.gingerlabs.NotabilityMac'],
    description: '手写笔记与 PDF 标注工具，支持 Apple Pencil 压感书写、录音同步与云同步。',
  },
  {
    names: ['GoodNotes'],
    bundleIds: ['com.goodiware.goodnotes6mac'],
    description: '手写笔记应用，以逼真的纸张质感、强大搜索和笔记组织著称，适合学习与会议记录。',
  },
  {
    names: ['MarginNote'],
    bundleIds: ['com.sunborn.marginnote4'],
    description: '深度阅读与知识管理工具，支持 PDF/EPUB 批注、思维导图生成、卡片复习与知识串联。',
  },
  {
    names: ['PDF Expert'],
    bundleIds: ['com.readdle.PDFExpert-Mac'],
    description: 'macOS 专业 PDF 编辑与阅读工具，支持文本编辑、批注、表单填写、合并拆分与数字签名。',
  },
  {
    names: ['Zotero'],
    bundleIds: ['org.zotero.zotero'],
    description: '开源学术文献管理工具，支持自动抓取、引用格式化、协作共享与 10000+ 期刊样式。',
  },
  {
    names: ['Principle'],
    bundleIds: ['com.danielhooper.principle'],
    description: 'macOS 交互动效原型设计工具，可将 Sketch/Figma 设计稿快速转化为可交互的高保真原型。',
  },
  {
    names: ['ProtoPie'],
    bundleIds: ['studio.emails.protopie'],
    description: '高保真交互原型设计工具，支持传感器、语音、条件逻辑和多设备联动，无需代码。',
  },
  {
    names: ['Framer'],
    bundleIds: ['com.framer.desktop'],
    description: '从设计到发布的全栈网站构建工具，支持可视化编辑、React 组件和一键部署。',
  },
  {
    names: ['Canva'],
    bundleIds: ['com.canva.CanvaDesktop'],
    description: '在线图形设计平台，提供海量模板、素材与 AI 设计助手，适合非设计师快速出图。',
  },
  {
    names: ['Affinity Designer'],
    bundleIds: ['com.seriflabs.affinitydesigner2'],
    description: 'Serif 出品的矢量图形设计软件，Adobe Illustrator 的有力替代品，一次性购买无订阅。',
  },
  {
    names: ['Affinity Photo'],
    bundleIds: ['com.seriflabs.affinityphoto2'],
    description: 'Serif 出品的专业照片编辑软件，Adobe Photoshop 的有力替代品，功能全面且一次性购买。',
  },
  {
    names: ['Pixelmator Pro'],
    bundleIds: ['com.pixelmatorteam.pixelmator-pro'],
    description: 'macOS 原生图像编辑软件，以机器学习驱动的修图工具和流畅性能著称，界面优雅直观。',
  },
  {
    names: ['Cinema 4D'],
    bundleIds: ['com.maxon.cinema4d'],
    description: 'Maxon 出品的专业 3D 建模、动画与渲染软件，以运动图形和易用性著称，广泛用于广告与影视。',
  },
  {
    names: ['Maya'],
    bundleIds: ['com.autodesk.Maya2024'],
    description: 'Autodesk 出品的专业 3D 动画与视觉特效软件，电影和游戏行业角色动画与特效的标准工具。',
  },
  {
    names: ['DaVinci Resolve'],
    bundleIds: ['com.blackmagic-design.DaVinciResolve'],
    description: 'Blackmagic 出品的免费专业视频剪辑与调色软件，集剪辑、调色、特效、音频后期于一体。',
  },
  {
    names: ['Motion'],
    bundleIds: ['com.apple.motionapp'],
    description: 'Apple 动态图形与视觉效果软件，与 Final Cut Pro 深度集成，用于制作标题、转场和粒子特效。',
  },
  {
    names: ['Compressor'],
    bundleIds: ['com.apple.compressor'],
    description: 'Apple 视频编码与批量导出工具，支持 HEVC、ProRes 等格式，与 Final Cut Pro 无缝协作。',
  },
  {
    names: ['iMovie'],
    bundleIds: ['com.apple.iMovieApp'],
    description: 'Apple 入门级视频剪辑软件，提供主题模板、绿幕特效与一键分享到社交平台。',
  },
  {
    names: ['QuickTime Player'],
    bundleIds: ['com.apple.QuickTimePlayerX'],
    description: 'Apple 原生媒体播放器与屏幕录制工具，支持基本视频修剪与音画同步。',
  },
  {
    names: ['Photos', '照片'],
    bundleIds: ['com.apple.Photos'],
    description: 'Apple 原生照片管理与编辑应用，支持智能相册、iCloud 同步、AI 人脸识别与基础修图。',
  },
  {
    names: ['Messages', '信息'],
    bundleIds: ['com.apple.MobileSMS'],
    description: 'Apple 原生即时通讯应用，支持 iMessage 文字、图片、视频、语音消息与 Memoji。',
  },
  {
    names: ['Mail'],
    bundleIds: ['com.apple.mail'],
    description: 'Apple 原生邮件客户端，支持多账户管理、智能分类、隐私保护与专注模式过滤。',
  },
  {
    names: ['Calendar', '日历'],
    bundleIds: ['com.apple.iCal'],
    description: 'Apple 原生日历应用，支持多账户同步、邀请管理、时区智能切换与专注模式集成。',
  },
  {
    names: ['Notes', '备忘录'],
    bundleIds: ['com.apple.Notes'],
    description: 'Apple 原生备忘录应用，支持富文本、手写、扫描文档、标签组织与 iCloud 同步。',
  },
  {
    names: ['Reminders', '提醒事项'],
    bundleIds: ['com.apple.reminders'],
    description: 'Apple 原生待办事项管理应用，支持列表、标签、位置提醒、智能列表与共享协作。',
  },
  {
    names: ['Tor Browser'],
    bundleIds: ['org.torproject.torbrowser'],
    description: '基于 Firefox 的匿名浏览器，通过 Tor 网络多层加密路由，保护用户隐私与上网匿名性。',
  },
  {
    names: ['Opera'],
    bundleIds: ['com.operasoftware.Opera'],
    description: '老牌浏览器，内置免费 VPN、广告拦截、侧边栏工具与加密货币钱包，基于 Chromium 内核。',
  },
  {
    names: ['Vivaldi'],
    bundleIds: ['com.vivaldi.Vivaldi'],
    description: '高度可定制的 Chromium 浏览器，由 Opera 联合创始人打造，支持标签堆叠、笔记与邮件客户端。',
  },
  {
    names: ['QQ'],
    bundleIds: ['com.tencent.qq'],
    description: '腾讯旗下即时通讯软件，支持文字、语音、视频通话、文件传输、群聊与屏幕共享。',
  },
  {
    names: ['腾讯会议'],
    bundleIds: ['com.tencent.meeting'],
    description: '腾讯视频会议软件，支持高清音视频会议、屏幕共享、白板协作与会议录制转写。',
  },
  {
    names: ['WhatsApp'],
    bundleIds: ['net.whatsapp.WhatsApp'],
    description: 'Meta 旗下全球最流行的即时通讯应用，支持端到端加密文字、语音、视频通话与状态更新。',
  },
  {
    names: ['Signal'],
    bundleIds: ['org.whispersystems.signal-desktop'],
    description: '以隐私与安全为最高优先级的通讯应用，所有消息默认端到端加密，开源且非盈利。',
  },
  {
    names: ['Skype'],
    bundleIds: ['com.skype.skype'],
    description: '微软视频通话与即时通讯工具，支持群组通话、屏幕共享与 Skype 号码拨打固话。',
  },
  {
    names: ['Line'],
    bundleIds: ['jp.naver.line.mac'],
    description: '日本最流行的即时通讯应用，以丰富的贴图、官方账号和 Line Pay 支付生态著称。',
  },
  {
    names: ['Webex'],
    bundleIds: ['com.cisco.webexmeetingsapp'],
    description: '思科企业级视频会议与协作平台，支持高清会议、白板、实时翻译与大规模 webinar。',
  },
  {
    names: ['Microsoft Teams', 'Teams'],
    bundleIds: ['com.microsoft.teams'],
    description: '微软企业协作平台，融合聊天、视频会议、文件协作与应用集成，Office 365 生态核心组件。',
  },
  {
    names: ['Outlook'],
    bundleIds: ['com.microsoft.Outlook'],
    description: '微软邮件与日历客户端，支持多账户管理、智能收件箱、会议安排与任务跟踪。',
  },
  {
    names: ['Thunderbird'],
    bundleIds: ['org.mozilla.thunderbird'],
    description: 'Mozilla 开源邮件客户端，支持多账户、RSS、日历与丰富扩展，注重隐私保护。',
  },
  {
    names: ['Spark'],
    bundleIds: ['com.readdle.smartemail.Spark'],
    description: '智能邮件客户端，以优先级收件箱、团队协作和邮件模板著称，支持 iOS 与 macOS。',
  },
  {
    names: ['Fantastical'],
    bundleIds: ['com.flexibits.fantastical2.mac'],
    description: 'macOS 智能日历应用，支持自然语言输入、会议调度、天气集成与多账户同步。',
  },
  {
    names: ['Todoist'],
    bundleIds: ['com.todoist.mac.Todoist'],
    description: '跨平台待办事项管理应用，支持自然语言快速添加、项目层级、标签过滤与 Karma 积分系统。',
  },
  {
    names: ['TickTick', '滴答清单'],
    bundleIds: ['com.appearyule.ticktick-mac'],
    description: '全能待办事项与时间管理应用，支持番茄钟、日历视图、习惯打卡与多平台同步。',
  },
  {
    names: ['Evernote', '印象笔记'],
    bundleIds: ['com.evernote.Evernote'],
    description: '老牌笔记与知识管理应用，支持 Web 剪藏、文档扫描、手写笔记与团队知识库。',
  },
  {
    names: ['有道云笔记', 'Youdao Note'],
    bundleIds: ['com.youdao.note'],
    description: '网易出品云笔记应用，支持 Markdown、思维导图、OCR 识别与文档协作编辑。',
  },
  {
    names: ['WPS Office'],
    bundleIds: ['com.kingsoft.wpsoffice.mac'],
    description: '金山出品办公软件套件，兼容 Microsoft Office 格式，支持文字、表格、演示与 PDF 编辑。',
  },
  {
    names: ['LibreOffice'],
    bundleIds: ['org.libreoffice.script'],
    description: '开源办公套件，兼容 Microsoft Office 格式，提供 Writer、Calc、Impress 等完整办公工具。',
  },
  {
    names: ['AppCleaner'],
    bundleIds: ['net.freemacsoft.AppCleaner'],
    description: 'macOS 应用卸载清理工具，拖拽即可彻底删除应用及其残留配置文件，轻量免费。',
  },
  {
    names: ['OnyX'],
    bundleIds: ['com.titanium.OnyX'],
    description: 'macOS 系统维护与优化工具，可清理缓存、重建索引、验证磁盘权限，按 macOS 版本分开发布。',
  },
  {
    names: ['Mounty'],
    bundleIds: ['com.volkswagen.Mounty'],
    description: 'macOS NTFS 分区挂载工具，以读写模式挂载 Windows 格式的 NTFS 移动硬盘与 U 盘。',
  },
  {
    names: ['Hidden Bar'],
    bundleIds: ['com.dwarvesv.minimalbar'],
    description: '开源 macOS 菜单栏图标隐藏工具，可将不常用图标折叠到二级菜单，保持菜单栏整洁。',
  },
  {
    names: ['Amphetamine'],
    bundleIds: ['com.if.Amphetamine'],
    description: 'macOS 防休眠工具，可设定规则保持 Mac 屏幕常亮，适合下载、演示与长时间任务。',
  },
  {
    names: ['Caffeine'],
    bundleIds: ['com.lightheadsw.caffeine'],
    description: '经典 macOS 防休眠小工具，点击菜单栏图标即可临时阻止 Mac 进入睡眠状态。',
  },
  {
    names: ['Flux'],
    bundleIds: ['org.herf.Flux'],
    description: '屏幕色温调节工具，根据日出日落自动调整显示器蓝光比例，减轻夜间用眼疲劳。',
  },
  {
    names: ['One Switch'],
    bundleIds: ['com.roadieum.ONESwitch'],
    description: 'macOS 快捷开关工具，在菜单栏一键切换暗色模式、隐藏桌面、保持亮屏、勿扰模式等。',
  },
  {
    names: ['SoundSource'],
    bundleIds: ['com.rogueamoeba.soundsource'],
    description: 'macOS 音频路由与控制工具，可为每个应用独立设置音量、均衡器和音频输出设备。',
  },
  {
    names: ['Audio Hijack'],
    bundleIds: ['com.rogueamoeba.audiohijack2'],
    description: 'macOS 音频录制工具，可录制任意应用的音频输出，支持实时音效处理与定时录制。',
  },
  {
    names: ['Loopback'],
    bundleIds: ['com.rogueamoeba.loopback'],
    description: 'macOS 虚拟音频路由工具，创建虚拟音频设备将多个音源混合后输出到任意应用。',
  },
  {
    names: ['Boom 3D'],
    bundleIds: ['com.globaldelight.Boom3D'],
    description: 'macOS 3D 环绕音效增强工具，提供沉浸式音频体验、均衡器调节与多种场景预设。',
  },
  {
    names: ['GarageBand'],
    bundleIds: ['com.apple.garageband10'],
    description: 'Apple 入门音乐制作软件，内置丰富 loops、虚拟乐器与录音功能，是音乐创作的最佳起点。',
  },
  {
    names: ['Tim'],
    bundleIds: ['com.tencent.tim'],
    description: '腾讯出品办公版 QQ，专注办公协作，支持云文件、日程、邮件与在线文档编辑。',
  },
  {
    names: ['Rider'],
    bundleIds: ['com.jetbrains.rider'],
    description: 'JetBrains .NET 跨平台 IDE，支持 C#、Unity、Unreal Engine 开发，提供智能重构与调试。',
  },
  {
    names: ['DataGrip'],
    bundleIds: ['com.jetbrains.datagrip'],
    description: 'JetBrains 数据库 IDE，支持 SQL 智能补全、可视化查询构建与多数据库统一管理。',
  },
  {
    names: ['DataSpell'],
    bundleIds: ['com.jetbrains.dataspell'],
    description: 'JetBrains 数据科学 IDE，专为 Jupyter Notebook 和 Python 数据分析工作流优化设计。',
  },
  {
    names: ['RubyMine'],
    bundleIds: ['com.jetbrains.rubymine'],
    description: 'JetBrains Ruby 与 Rails 开发 IDE，提供智能代码补全、测试框架集成与数据库工具。',
  },
  {
    names: ['AppCode'],
    bundleIds: ['com.jetbrains.AppCode'],
    description: 'JetBrains 智能 Swift/Objective-C IDE，深度支持 iOS/macOS 开发，现已停止维护。',
  },
  {
    names: ['Fleet'],
    bundleIds: ['com.jetbrains.fleet'],
    description: 'JetBrains 下一代轻量级分布式 IDE，支持多语言、实时协作与云端开发环境连接。',
  },
  {
    names: ['Nova'],
    bundleIds: ['com.panic.Nova'],
    description: 'Panic 出品的 macOS 代码编辑器，原生 Swift 构建，内置 Git 与终端，专为 Mac 优化。',
  },
  {
    names: ['Nova'],
    bundleIds: ['com.panic.Nova'],
    description: 'Panic 出品的 macOS 代码编辑器，原生 Swift 构建，内置 Git 与终端，专为 Mac 优化。',
  },
  {
    names: ['Atom'],
    bundleIds: ['com.github.atom'],
    description: 'GitHub 出品的可定制文本编辑器，基于 Electron，以"21 世纪可 hack 的编辑器"为理念，现已归档。',
  },
  {
    names: ['Vim'],
    bundleIds: ['org.vim.Vim'],
    description: '经典终端文本编辑器，以模态编辑和极致效率著称，通过 .vimrc 可实现无限定制。',
  },
  {
    names: ['Neovim'],
    bundleIds: ['io.neovim.nvim'],
    description: 'Vim 的重构增强版，采用异步架构，内置 LSP 支持，是现代终端开发者的首选编辑器。',
  },
  {
    names: ['Emacs'],
    bundleIds: ['org.gnu.emacs'],
    description: 'GNU 出品的可扩展文本编辑器，被称为"伪装成编辑器的操作系统"，支持 Elisp 深度定制。',
  },
  {
    names: ['Insomnia'],
    bundleIds: ['com.insomnia.app'],
    description: '开源 API 客户端与调试工具，支持 REST、GraphQL、gRPC，以简洁界面和插件扩展著称。',
  },
  {
    names: ['DBeaver'],
    bundleIds: ['com.dbeaver.desktop.product'],
    description: '开源通用数据库管理工具，支持几乎所有主流数据库，提供 ER 图、数据迁移与 SQL 编辑器。',
  },
  {
    names: ['Hyper'],
    bundleIds: ['co.zeit.hyper'],
    description: '基于 Electron 的可定制终端，使用 HTML/CSS/JS 构建，支持丰富插件主题。',
  },
  {
    names: ['Kitty'],
    bundleIds: ['net.kovidgoyal.kitty'],
    description: '基于 GPU 加速的现代化终端模拟器，支持字体连字、图像渲染、多窗口与远程控制协议。',
  },
  {
    names: ['Alacritty'],
    bundleIds: ['io.alacritty'],
    description: 'OpenGL 加速的跨平台终端模拟器，以极简设计和极致渲染性能为核心追求。',
  },
  {
    names: ['Node.js', 'Node'],
    bundleIds: ['org.nodejs.node'],
    description: 'JavaScript 运行时环境，基于 V8 引擎，使 JS 可以在服务端运行，npm 是全球最大包管理器。',
  },
  {
    names: ['Sequel Pro'],
    bundleIds: ['com.sequelpro.SequelPro'],
    description: '经典开源 MySQL 数据库管理工具，界面简洁直观，macOS 开发者长期喜爱的数据库客户端。',
  },
  {
    names: ['Zeplin'],
    bundleIds: ['io.zeplin.osx'],
    description: '设计交付与协作平台，自动提取设计稿中的标注、资源与 CSS，连接设计师与开发者。',
  },
  {
    names: ['Lightroom', 'Adobe Lightroom'],
    bundleIds: ['com.adobe.LightroomClassicCC7'],
    description: 'Adobe 专业照片管理与后期处理软件，以强大的 RAW 处理、批量编辑与云同步著称。',
  },
  {
    names: ['InDesign', 'Adobe InDesign'],
    bundleIds: ['com.adobe.InDesign'],
    description: 'Adobe 专业排版与出版软件，用于杂志、书籍、电子书与交互式 PDF 的设计制作。',
  },
  {
    names: ['GIMP'],
    bundleIds: ['org.gimp.gimp'],
    description: '开源免费图像编辑软件，被誉为"免费版 Photoshop"，支持图层、蒙版与丰富插件。',
  },
  {
    names: ['Inkscape'],
    bundleIds: ['org.inkscape.Inkscape'],
    description: '开源矢量图形编辑软件，支持 SVG 原生编辑，是 Illustrator 的免费替代品。',
  },
  {
    names: ['Lightroom', 'Adobe Lightroom'],
    bundleIds: ['com.adobe.LightroomCC'],
    description: 'Adobe 云端照片编辑与管理工具，支持跨设备同步编辑，面向摄影师的移动优先工作流。',
  },
  {
    names: ['ZBrush'],
    bundleIds: ['com.pixologic.ZBrush'],
    description: '行业标准的数字雕刻软件，以高多边形雕刻和细节绘制能力著称，广泛用于影视与游戏角色。',
  },
  {
    names: ['Protopie'],
    bundleIds: ['studio.emails.protopie'],
    description: '高保真交互原型设计工具，支持传感器、语音、条件逻辑和多设备联动，无需代码。',
  },
  {
    names: ['Origami Studio'],
    bundleIds: ['com.facebook.Origami-Studio'],
    description: 'Meta 出品的免费原型设计工具，以强大的动效系统和 Patch 节点式交互逻辑著称。',
  },
  {
    names: ['Lightroom', 'Adobe Lightroom'],
    bundleIds: ['com.adobe.lr.desktop'],
    description: 'Adobe 云端照片编辑与管理工具，支持跨设备同步编辑，面向摄影师的移动优先工作流。',
  },
  {
    names: ['QQ音乐', 'QQMusic'],
    bundleIds: ['com.tencent.qqmusicmac'],
    description: '腾讯出品音乐流媒体平台，拥有海量华语曲库，支持高品质音频与社交分享。',
  },
  {
    names: ['bilibili', '哔哩哔哩'],
    bundleIds: ['tv.danmaku.bili'],
    description: '中国年轻世代高度聚集的文化社区与视频平台，以弹幕互动、二次元内容与 UP 主生态著称。',
  },
  {
    names: ['Infuse'],
    bundleIds: ['com.firecore.infuse'],
    description: 'Apple 生态全能媒体播放器，自动抓取电影海报与元数据，支持 4K HDR 与多音轨字幕。',
  },
  {
    names: ['Movist'],
    bundleIds: ['com.movist.MovistPro'],
    description: 'macOS 高性能视频播放器，支持硬件加速、多音轨字幕与自定义播放控制界面。',
  },
  {
    names: ['Audacity'],
    bundleIds: ['org.audacityteam.audacity'],
    description: '开源免费音频编辑与录音软件，支持多轨编辑、降噪、变调与多种音频格式导出。',
  },
  {
    names: ['爱奇艺', 'iQIYI'],
    bundleIds: ['com.iqiyi.player'],
    description: '中国主流视频流媒体平台，提供电视剧、电影、综艺等丰富内容，支持 4K 与杜比音效。',
  },
  {
    names: ['优酷', 'Youku'],
    bundleIds: ['com.youku.mac'],
    description: '阿里巴巴旗下视频平台，提供电影、剧集、综艺与短视频内容，支持高清播放。',
  },
  {
    names: ['Shadowrocket'],
    bundleIds: ['com.liguangming.Shadowrocket'],
    description: 'iOS/macOS 网络代理工具，支持多种协议与规则分流，用于网络流量管理与隐私保护。',
  },
  {
    names: ['Quantumult', 'Quantumult X'],
    bundleIds: ['com.crossutility.quantumult-x'],
    description: '高级网络代理与 HTTP 调试工具，支持多种协议、分流规则、脚本改写与 MitM。',
  },
  {
    names: ['V2Ray', 'V2RayX', 'V2RayU'],
    bundleIds: ['net.yerihyo.v2rayx', 'v2ray.project.v2rayu'],
    description: '开源网络代理工具，基于 VMess/VLESS 协议，支持多路复用与流量伪装，用于科学上网。',
  },
  {
    names: ['Trojan'],
    bundleIds: ['com.trojanmac.trojan'],
    description: '伪装成 HTTPS 流量的代理协议工具，通过 TLS 加密通信，隐蔽性优于传统代理。',
  },
  {
    names: ['VPN', 'ProtonVPN'],
    bundleIds: ['ch.protonvpn.mac'],
    description: '瑞士 Proton 出品的隐私 VPN 服务，基于 Secure Core 架构，不记录日志，开源客户端。',
  },
  {
    names: ['WireGuard'],
    bundleIds: ['com.wireguard.macos'],
    description: '新一代开源 VPN 协议，以极简代码、高性能和现代加密算法著称，已集成入 Linux 内核。',
  },
  {
    names: ['NordVPN'],
    bundleIds: ['com.nordvpn.macos'],
    description: '全球知名商业 VPN 服务，提供 5000+ 服务器、双重加密与 CyberSec 广告拦截功能。',
  },
  {
    names: ['ExpressVPN'],
    bundleIds: ['com.expressvpn.ExpressVPN'],
    description: '高速商业 VPN 服务，以 Lightway 协议、TrustedServer 技术和流媒体解锁能力著称。',
  },
  {
    names: ['LastPass'],
    bundleIds: ['com.lastpass.lastpassmacdesktop'],
    description: '跨平台密码管理器，支持自动填充、安全笔记与家庭成员共享，提供免费基础版。',
  },
  {
    names: ['Enpass'],
    bundleIds: ['in.sinew.Enpass-Desktop'],
    description: '离线优先的密码管理器，数据存储在本地或用户自有云盘，支持生物识别与团队共享。',
  },
  {
    names: ['Dashlane'],
    bundleIds: ['com.dashlane.Dashlane'],
    description: '智能密码管理器，内置暗网监控与 VPN，提供自动密码更改与身份盗窃保护功能。',
  },
  {
    names: ['Lulu'],
    bundleIds: ['com.objective-see.lulu'],
    description: '开源 macOS 防火墙工具，免费替代 Little Snitch 基础功能，拦截应用出站网络连接。',
  },
  {
    names: ['Micro Snitch'],
    bundleIds: ['at.obdev.MicroSnitch'],
    description: 'macOS 摄像头与麦克风监控工具，当硬件被激活时在菜单栏发出视觉提示，保护隐私。',
  },
  {
    names: ['Keychain Access'],
    bundleIds: ['com.apple.keychainaccess'],
    description: 'Apple 原生密码与证书管理工具，存储网站密码、安全备注、证书与密钥，iCloud 同步。',
  },
  {
    names: ['Magnet'],
    bundleIds: ['com.crowdcafe.windowmagnet'],
    description: 'macOS 窗口管理工具，通过拖拽或快捷键将窗口快速吸附到屏幕边缘，实现高效分屏。',
  },
  {
    names: ['AppCleaner'],
    bundleIds: ['net.freemacsoft.AppCleaner'],
    description: 'macOS 应用卸载清理工具，拖拽即可彻底删除应用及其残留配置文件，轻量免费。',
  },
  {
    names: ['Carbon Copy Cloner'],
    bundleIds: ['com.bombich.ccc7'],
    description: 'macOS 磁盘克隆与备份工具，可创建可启动备份、增量备份与计划任务，数据安全首选。',
  },
  {
    names: ['AppCleaner'],
    bundleIds: ['net.freemacsoft.AppCleaner'],
    description: 'macOS 应用卸载清理工具，拖拽即可彻底删除应用及其残留配置文件，轻量免费。',
  },
  {
    names: ['Finder'],
    bundleIds: ['com.apple.finder'],
    description: 'Apple 原生文件管理器，提供图标/列表/分栏视图、Spotlight 搜索、标签与 iCloud 云盘集成。',
  },
  {
    names: ['Activity Monitor'],
    bundleIds: ['com.apple.ActivityMonitor'],
    description: 'Apple 原生系统监控工具，查看 CPU、内存、磁盘、网络使用情况与进程管理。',
  },
  {
    names: ['System Settings', 'System Preferences', '设置'],
    bundleIds: ['com.apple.systempreferences', 'com.apple.SystemPreferences'],
    description: 'macOS 系统偏好设置，管理用户账户、显示器、网络、隐私、节能等系统级配置。',
  },
];

const CATEGORY_FALLBACK: Record<string, string> = {
  'dev-tools': '开发工具，用于编写、调试和管理代码。',
  design: '设计创意工具，用于图形设计、UI/UX 或视觉创作。',
  productivity: '效率办公软件，用于文档处理、任务管理或提升工作效率。',
  communication: '通讯协作工具，用于即时消息、视频会议或邮件沟通。',
  browsers: '网络浏览器，用于浏览网页、搜索信息和访问互联网服务。',
  utilities: '系统工具，用于优化、维护或增强 macOS 使用体验。',
  media: '影音娱乐工具，用于播放、编辑或管理多媒体内容。',
  security: '安全防护工具，用于保护隐私、管理密码或网络代理。',
};

export function getBuiltinDescription(name: string, bundleId?: string): string | null {
  const normalizedName = name.trim().toLowerCase();

  for (const entry of BUILTIN_DESCRIPTIONS) {
    if (bundleId && entry.bundleIds?.some((id) => id.toLowerCase() === bundleId.toLowerCase())) {
      return entry.description;
    }
    if (entry.names.some((n) => n.toLowerCase() === normalizedName)) {
      return entry.description;
    }
  }

  return null;
}

export function getCategoryFallbackDescription(category: string): string {
  return CATEGORY_FALLBACK[category] ?? '一款实用的 macOS 应用程序。';
}
