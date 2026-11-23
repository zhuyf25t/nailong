# 在 Codex 中制作《奶泡乱斗》

本机 Codex 已登记两个 stdio 服务器，工具由官方 MCP TypeScript SDK 提供。每次工具调用启动一个本地、无界面的引擎进程，读写 HW3 工程文件。编辑器中打开同一文件时，可以在刷新后查看成果。

| 服务器 | 工具 | 输入与结果 |
|---|---|---|
| `hw3_blender` | `version`、`inspect_scene` | 读取 Blender 版本，或读取相对于 `art/` 的场景文件，返回对象名、面数和材质 |
| `hw3_blender` | `compose_prop`、`transform_copy` | 用命名的基础几何体、颜色和变换创建道具，或对已有模型的单个对象调整变换，保存新文件到 `art/mcp/` |
| `hw3_blender` | `export_glb` | 把指定 .blend 输出到 `game/assets/models/mcp/` |
| `hw3_godot` | `version`、`import_project` | 读取 Godot 版本，或导入整个 `game/` 的资源 |
| `hw3_godot` | `compose_scene` | 用已经导入的 GLB 建立实例，写入 `game/scenes/mcp/` 下的新 PackedScene |
| `hw3_godot` | `run_scene` | 加载主场景或指定的 .tscn，运行 1–300 帧，报告引擎错误 |

结算奖杯来自 Blender 工程 [soda_cup.blend](../../art/trophy/soda_cup.blend)。可让 Codex「用 hw3_blender 的 inspect_scene 检查 trophy/soda_cup.blend，列出它的材质」，也可让它「用 hw3_godot 运行 main.tscn 六十帧」。每个引擎从当前项目目录读取文件，所有调用都在本机完成。

奖杯用七种材质制作双耳杯、压齿瓶盖、珍珠与条纹吸管。渲染相机使用正交投影。脚本先渲染透明图，再将画面缩至 64 × 64 像素、匹配街机调色板并添加单像素轮廓。最终图位于 [winner.png](../../game/assets/trophy/winner.png)。在 HW3 根目录用下列命令重建可编辑场景和 PNG。

```powershell
& 'D:\HW3Tools\blender-4.5.16-windows-x64\blender.exe' --background --factory-startup --python-exit-code 1 --python art/trophy/build.py
```

新增模型时可使用 compose_prop 和 export_glb。几何体采用米制，旋转使用角度。Blender 使用 Z 轴朝上，Godot 使用 Y 轴朝上。GLB 导出处理坐标系转换。新文件名遵循小写字母、数字和下划线规则，同名时返回错误。

## 在其他工作区登记

在本目录打开 PowerShell。先安装 Node.js 以及两个引擎，再把下面的可执行路径调整到该机器的实际位置。

```powershell
npm ci --ignore-scripts --no-audit --no-fund
$studio = (Resolve-Path .\studio.cjs).Path
$node = (Get-Command node.exe).Source
$blender = 'D:\HW3Tools\blender-4.5.16-windows-x64\blender.exe'
$godot = 'D:\HW3Tools\Godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe'
codex mcp add hw3_blender -- $node $studio blender $blender
codex mcp add hw3_godot -- $node $studio godot $godot
node .\smoke.cjs $blender $godot
```

验证脚本使用官方 MCP 客户端完成握手与工具发现，创建带随机文件名的临时锥体，修改高度，导出 GLB，让 Godot 导入模型并将它打包为场景，最后运行十帧。结束后清理本次创建的源文件和资源。Godot 正常维护其 `.godot/` 导入缓存。

本机版本为 Blender 4.5.16 LTS、Godot 4.7.2、Node.js 24 和 MCP SDK 1.30.0。本项目沿用了已注册的 hw3_blender 与 hw3_godot 服务路径。当前 Codex 聊天已发现五个 Blender 工具和四个 Godot 工具。Blender MCP 从冠军杯源文件读回 58 个对象（含相机与灯光）、2,837 个网格面与七种材质。Godot 读回的奖杯纹理为 64 × 64，非透明区域宽 59 像素、高 60 像素。Godot MCP 已加载本作 main.tscn 并运行 60 帧，正常退出。

协议与引擎命令依据 [MCP 工具规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[Blender 命令行手册](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html) 和 [Godot 命令行手册](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)。
