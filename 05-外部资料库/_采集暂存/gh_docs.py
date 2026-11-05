import json, os, time

WORK = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存"
DEST = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
placed = json.load(open(os.path.join(WORK, "placed.json"), encoding="utf-8"))
inv = {p["repo"]: p for p in placed}
assets = {}
try:
    assets = json.load(open(os.path.join(WORK, "asset_fetch_report.json"), encoding="utf-8"))
except Exception:
    pass

# repo -> (价值判定, 并入计划的落点, 用法)
MAP = {
 "CyC2018/CS-Notes": ("高", "算法专项+计算机系统专项", "OS/网络/数据库/系统设计问答与图解，作 G1/G4/G5 的自测题库；答案先自己讲再对照"),
 "Snailclimb/JavaGuide": ("高", "阶段05/中线Java/专项-高并发", "MySQL、Redis、并发、系统设计的「高频题+追问」清单；中线 Java 主参考"),
 "xiaolincoder/CS-Base": ("高", "阶段01计算机与Web基础、专项-计算机系统", "图解网络/系统/MySQL/计组成，替代纯文字背诵；配图已从作者 CDN 补入 _remote_assets"),
 "wolverinn/Waking-Up": ("高", "每四周复盘的口头自测", "「问题+追问+答案」三段式，最接近真实面试追问节奏"),
 "0voice/interview_internal_reference": ("中", "阶段06/08 面试准备", "按公司分目录的真题清单，用于模拟面试抽题"),
 "0voice/Campus_recruitment_interview_questions": ("中", "阶段08 毕业与求职", "校招分模块高频题，做限时口述练习"),
 "CoderLeixiaoshuai/java-eight-part": ("中", "中线Java", "Java 八股成册，配合 JavaGuide 交叉核对版本差异"),
 "AobingJava/JavaFamily": ("中", "中线Java", "集合/JUC/JVM 面试专题"),
 "zijing2333/CSView": ("中", "专项-计算机系统与多语言", "C++/Java/Go/MySQL 多语言视角的面试汇编"),
 "lengyue1024/BAT_interviews": ("低", "阶段08 备选", "年代较早（2022 停更），只用于题型认知"),
 "xiaobaiTech/golangFamily": ("低", "阶段09 Go 备选", "仓库已被删空（本地仅 2 个文件），不要依赖"),
 "bregman-arie/devops-exercises": ("高", "阶段07 部署运维", "Linux/容器/K8s/CI 可回答的运维问答题，直接对应 G5 交付要求"),
 "youngyangyang04/leetcode-master": ("高", "专项-算法（第 5–24 周主线）", "200 题有序题单+专题总结，替代「自己拼题单」；图解配图已补入"),
 "halfrost/LeetCode-Go": ("高", "专项-算法/阶段09 Go", "Go 实现+100% 测试覆盖，可作 Go 语言 L2/L3 的编码范例"),
 "doocs/leetcode": ("中", "专项-算法多语言对照", "多语言题解（含剑指Offer/面试金典），只用于复盘比对，禁止抄解"),
 "neetcode-gh/leetcode": ("高", "专项-算法（Hot100 之后的结构化路线）", "NeetCode 150 分级题单 + Python 解法，含按题型索引"),
 "wisdompeak/LeetCode": ("中", "专项-算法变体与Hard", "Medium+ 详解，适合变体训练与思路复盘"),
 "kamyu104/LeetCode-Solutions": ("中", "专项-算法第二语言", "Python/C++ 全题解，含 MySQL 目录可作 SQL 题源之一"),
 "azl397985856/leetcode": ("中", "专项-算法专题框架", "按专题归类的题解与模板"),
 "krahets/hello-algo": ("高", "阶段01数据结构入门、专项-算法L1", "动画图解+可运行多语言代码，建立第一轮直觉"),
 "trekhleb/javascript-algorithms": ("高", "阶段02 JS/TS、专项-算法工程迁移", "TS/JS 算法实现与测试，正好对应主线主力语言"),
 "TheAlgorithms/Python": ("中", "专项-算法第二语言", "通用算法实现库，用于对照而非首选"),
 "Blankj/awesome-java-leetcode": ("低", "备选索引", "2020 年停更，只当索引用"),
 "kdn251/interviews": ("中", "专项-算法（LeetCode 解+题解）", "中英双语，算法实现为主"),
 "liquidslr/leetcode-company-wise-problems": ("高", "专项-算法第 5 项公司高频", "按公司/时间窗的 CSV 题单，含 ByteDance、TikTok"),
 "krishnadey30/LeetCode-Questions-CompanyWise": ("中", "公司高频题对照", "bytedance_alltime 等 CSV；数据为历史抓取"),
 "snehasishroy/leetcode-companywise-interview-questions": ("中", "公司高频题最新一档", "2026-07 抓取，含 bytedance 目录"),
 "donnemartin/system-design-primer": ("高", "专项-高并发与系统设计", "系统设计主参考+Anki 卡片，映射十二类设计题"),
 "karanpratapsingh/system-design": ("中", "专项-系统设计基础章节"),
 "ashishps1/awesome-system-design-resources": ("中", "专项-系统设计案例补充", "含大量真实案例讲解链接（GPL-3.0，仅自用）"),
 "checkcheckzz/system-design-interview": ("低", "索引页", "只有链接清单"),
 "greatfrontend/awesome-front-end-system-design": ("高", "阶段03 React + 前端设计题", "前端系统设计专题清单，直接补计划缺口"),
 "cdavid817/agent-interview": ("高", "阶段10 AI 专项 / 模块D RAG", "中文 AI Agent/LLM 面试题库 2038 题带参考答案（star 少，需边用边校）"),
 "Lau-Jonathan/LLM-Agent-Interview-Guide": ("中", "AI 专项八股速查"),
 "liyupi/mianshiya": ("低", "不适用", "仓库只有网站代码，题库在服务端，离线取不到题目"),
 "limouren2000/llms-dev-study": ("中", "AI 应用路线/RAG/Agent 学习"),
 "datawhalechina/llm-universe": ("高", "AI 模块D：RAG 工程与评测", "中文 RAG 项目式教程，含知识库构建"),
 "datawhalechina/hello-agents": ("高", "AI 模块D：Agent 与工具调用", "Agent 原理+实现教程，配套 MCP"),
 "explodinggradients/ragas": ("高", "AI 模块D 评估集口径", "RAG 指标（准确率/召回/拒答）实现，直接对应计划的评测要求"),
 "openai/evals": ("中", "评测集与评测方法参考"),
 "OWASP/Top10": ("高", "阶段06 安全（A01–A10 逐项映射）", "官方分类原文，替换计划里只写链接的部分"),
 "OWASP/CheatSheetSeries": ("高", "阶段06 安全防御细则", "认证/会话/CSRF/XSS/上传等具体防御清单"),
 "goldbergyoni/nodebestpractices": ("高", "阶段04 Node 后端", "Node 生产实践与陷阱，对应 G4 后端闭环"),
 "jwasham/coding-interview-university": ("中", "专项-计算机系统（长期补基础路线）"),
 "ossu/computer-science": ("中", "阶段01/长期 CS 基础课程替代路线"),
 "cunyu1943/JavaPark": ("低", "中线 Java 补充"),
 "LamberttLiu/CS-Basic-SelfLearning": ("中", "阶段01 408 四大件笔记（图多为本地未收录的课件）"),
 "cen6667/408": ("中", "计算机组成/OS/计网 补充讲义（PDF 为主）"),
 "forthespada/InterviewGuide": ("中", "自学路线与经验对照"),
 "puge-up/programming-play": ("低", "校招打法参考"),
 "crossoverJie/JCSprout": ("低", "2019 停更，仅 JVM/并发历史参考"),
 "doocs/advanced-java": ("高", "中线/专项-高并发", "并发、JVM、MQ、分布式、微服务高频问题集"),
 "xingshaocheng/architect-awesome": ("中", "技术栈全景地图对照用清单"),
 "0voice/from_coder_to_expert": ("中", "文章合集（697MB PDF/文档，按需查）"),
 "hoanhan101/ultimate-go": ("中", "阶段09 Go 运行时深入（gc/调度图解笔记）"),
 "chodocs/chodocs": ("中", "阶段03 前端知识体系"),
 "greatfrontend/top-javascript-interview-questions": ("高", "阶段02 JS/TS 自测题库", "2026 更新的 JS 高频问答"),
 "greatfrontend/top-reactjs-interview-questions": ("高", "阶段03 React 自测题库", "React 高频问答与原理追问"),
 "haizlin/fe-interview": ("中", "阶段02/03 每日前端题"),
 "Advanced-Frontend/Daily-Interview-Question": ("中", "前端每日一题（停更，题量有限）"),
 "sanchit0496/reactjs-machine-coding-challenges": ("高", "阶段03 机试题库", "41 道 React 现场编码题，正对计划缺的「机试」环节"),
 "practical-tutorials/project-based-learning": ("高", "02-项目实战 选题与参照实现"),
 "codecrafters-io/build-your-own-x": ("高", "专项-核心原理与深度实验（造数据库/OS/编译器）"),
 "mtdvio/every-programmer-should-know": ("中", "认知清单"),
 "liyupi/codefather": ("中", "学习路线对照（图多为外链，正文以 md 为主）"),
 "nilbuild/developer-roadmap": ("中", "全景地图交叉核对；本地是站点源码，读 md/yaml 大纲"),
 "microsoft/Web-Dev-For-Beginners": ("高", "阶段01/02 课程+测验（含每课 quiz 与项目）"),
 "microsoft/AI-For-Beginners": ("高", "阶段10 AI 专项课程（含测验与项目）"),
 "microsoft/ML-For-Beginners": ("中", "AI 方向基础课"),
 "microsoft/Data-Science-For-Beginners": ("中", "数据方向基础课"),
 "freeCodeCamp/freeCodeCamp": ("高", "阶段01–04 练习题库（curriculum 挑战正文与测验在仓库内）"),
 "yangshun/tech-interview-handbook": ("高", "阶段08 求职总纲（行为面+算法+系统+谈薪）"),
 "doocs/technical-books": ("低", "书目索引"),
 "EbookFoundation/free-programming-books": ("低", "书目索引"),
 "forthespada/CS-Books": ("低", "书目索引"),
 "itwanger/toBeBetterJavaer": ("中", "Java 学习向，图量极大（1 万+外链未全量补，用时再取）"),
 "DreamCats/java-notes": ("低", "个人笔记，质量不稳"),
 "bin392328206/six-finger": ("低", "Java 教程合集，年代偏早"),
 "dvsusan/susanSayJava": ("不采用", "仓库下载为空壳"),
 "Snailclimb/JavaGuide-Interview": ("中", "中线Java面试突击版（含 Go/Python 后端通用与计基）"),
 "getify/You-Dont-Know-JS": ("不采用", "原仓库仅剩 README，正文已迁出"),
 "jlevy/the-art-of-command-line": ("中", "阶段00/07 命令行与诊断速查"),
 "openai/evals": ("中", "评测框架参考"),
 "Liyuk/Interview-Book": ("未取到", "本轮下载失败"),
 "xiaobaiTech/golangFamily": ("低", "仓库已删空"),
}

CATS = {}
for p in placed:
    CATS.setdefault(p["category"], []).append(p)

lines = []
A = lines.append
A("# 外部资料库索引（GitHub 公开题库与知识库镜像）\n")
A("> 采集时间：%s｜采集方式：GitHub codeload 仓库压缩包 + 作者 CDN 配图补取｜全部为公开可下载内容，未使用任何付费资源。" % time.strftime("%Y-%m-%d"))
A(">")
A("> 本索引中的**文件数、体积、配图数是脚本实测**（见 `.source.json`），不是宣传口径。每个仓库目录内有 `.source.json` 记录来源 URL、分支、压缩包 sha256、许可证检测结果。")
A("")
A("## 一、怎么用")
A("")
A("1. **不要通读**。按下面表格的「并入计划落点」在对应 D 区间取用：先自问自答，再对照资料，答案只用于复盘。")
A("2. 题库类（`题库/`）用于**自测与限时**；知识库类（`知识库/`）用于**解释与对照**，不替代 [[../04-资源与评估/官方学习资源|官方文档]]。")
A("3. `_remote_assets/` 目录是从仓库外链的图床补下的配图；正文 markdown 保持原样未改写，因此本地阅读时图片链接仍指向外链。需要完全离线渲染时，可按 `.source.json` 与本目录文件名对应关系替换链接（未做改写，避免改动他人原文）。")
A("4. 版本与时效：多数中文面试仓库停在 2023–2026 之间，**API/框架版本一律以官方当前文档为准**，本库只提供题型与原理叙述。")
A("")
A("## 二、分类清单")
for cat in sorted(CATS):
    A("\n### %s（%d 个仓库，%d 个文件，%.1f GB）" % (
        cat, len(CATS[cat]), sum(p["files"] for p in CATS[cat]),
        sum(p["bytes"] for p in CATS[cat]) / 1073741824))
    A("")
    A("| 仓库 | 文件 | 体积 | 许可证（实测） | 价值 | 并入计划落点 |")
    A("| --- | ---: | ---: | --- | --- | --- |")
    for p in sorted(CATS[cat], key=lambda x: -x["files"]):
        name = p["repo"].split("/github.com/")[1].split("/")
        repo = "/".join(name[-2:])
        m = MAP.get(repo, ("待定", ""))
        lic = p["license_detected"] or ("有 LICENSE 文件未识别" if p["license_files"] else "无 LICENSE 文件")
        rel = "%s/%s/%s" % ("题库" if p["category"].startswith("题库") else "知识库",
                            p["category"].split("/", 1)[1], repo)
        entry = "README.md"
        if not os.path.exists(os.path.join(DEST, rel.replace("/", os.sep), "README.md")):
            entry = ".source.json"
        A("| [%s](<%s/%s>) | %s | %s MB | %s | %s | %s |" % (
            repo, rel, entry, f"{p['files']:,}", f"{p['mb']:,}", lic, m[0], m[1]))
A("")
A("## 三、已知取不到/不采用的来源")
A("")
A("| 来源 | 情况 |")
A("| --- | --- |")
for repo, m in MAP.items():
    if m[0] in ("不采用", "未取到") or m[1].startswith("不适用"):
        A("| %s | %s %s |" % (repo, m[0], m[1] if len(m) > 1 else ""))
A("\n（另：`CyC2077/CS-Notes`、`xiaolincoding-erp/notes`、`kamranahmedse/developer-roadmap`、`0voice/Introduction-to-GO` 四个地址已不存在，分别由 `CyC2018/CS-Notes`、`xiaolincoder/CS-Base`、`nilbuild/developer-roadmap` 取代；Go 面试专门仓库只找到已删空的 `xiaobaiTech/golangFamily`。）")

with open(os.path.join(DEST, "资料索引.md"), "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(lines) + "\n")
print("wrote 资料索引.md lines=%d" % len(lines))

tot_f = sum(p["files"] for p in placed)
tot_b = sum(p["bytes"] for p in placed)
print("repos=%d files=%d GB=%.2f" % (len(placed), tot_f, tot_b / 1073741824))
unmapped = [p["repo"] for p in placed if "/".join(p["repo"].split("/")[-2:]) not in MAP]
lic_dist = {}
for q in placed:
    k = q["license_detected"] or ("未识别的LICENSE文件" if q["license_files"] else "无LICENSE文件")
    lic_dist[k] = lic_dist.get(k, 0) + 1
print("license distribution:", sorted(lic_dist.items(), key=lambda x: -x[1]))
noref = [q["repo"] for q in placed if not any(b in q["repo"] for b in ())]
print("repos without curated mapping: %d" % len(unmapped))
for u in unmapped[:20]:
    print("   ", u)
