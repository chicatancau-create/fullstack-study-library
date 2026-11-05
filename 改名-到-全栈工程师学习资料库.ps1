# 一次性把项目文件夹改名为「全栈工程师学习资料库」
# 为什么要你手动跑：这个目录正是 Qoder 当前会话的工作目录，进程持有句柄，
# 在里面（包括我）改名都会被 Windows 拒绝（实测：子目录可改，根目录 Permission denied）。
# 操作：先关闭 Qoder 里的这个工作区（或直接退出 Qoder），再在 PowerShell 里执行本文件。

$ErrorActionPreference = 'Stop'
$old = 'E:\OBsidian\全栈工程师学习计划'
$new = 'E:\OBsidian\全栈工程师学习资料库'

if (-not (Test-Path $old)) { Write-Host "旧目录不存在，可能已经改过：$old"; exit 0 }
if (Test-Path $new) { Write-Error "目标已存在，先手工确认：$new"; exit 1 }

Rename-Item -LiteralPath $old -NewName $new
Write-Host "已改名 -> $new"

# 改名后把采集脚本里的绝对路径一并换掉（脚本都用绝对路径，不改就会指向不存在的目录）。
# 用 python 而不是 Set-Content：PowerShell 5.1 的 -Encoding UTF8 会加 BOM，且这些脚本按字节比对。
$helper = Join-Path $new '05-外部资料库\_采集暂存\rename_paths.py'
if (Test-Path -LiteralPath $helper) {
    python -X utf8 $helper
} else {
    Write-Warning "找不到 $helper，脚本里的旧绝对路径没有改写，请手工检查 _采集暂存/*.py"
}

# 复验：现行文档内部链接与超长路径
python -X utf8 (Join-Path $new '05-外部资料库\_采集暂存\vault_linkcheck.py')
python -X utf8 (Join-Path $new '05-外部资料库\_采集暂存\vault_longpath_fix.py')

# 校验仓库仍然完好
Set-Location -LiteralPath $new
git status --short | Select-Object -First 10
git log --oneline -1
Write-Host "下一步：重新打开 Qoder 工作区为 $new ，确认上面几项干净后 git push（GitHub 需走 7897 代理）。"
