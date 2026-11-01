# 正式前端资源镜像

本文件随正式前端 `/assets` 一起提供，记录下文所列模型、素材包与许可证。下文提到的生成器、`.asset-cache` 与研究目录均属于 **`nailong/threejs` 原型工作区**，并不位于 `frontend/public`。从 `nailong/frontend` 更新程序化角色与枪时，请先 `cd ../threejs`，运行 `npm run assets`；之后将 `threejs/public/assets` 同步至 `frontend/public/assets`。MegaKit 与精选场景的生成脚本也位于 `../threejs/scripts`。正式前端只消费已打包的资源，不需要 Blender 或在线下载。

模型目录保留了旧树木、圆靶等历史实验资源；正式训练场仅加载 `models/nailong.glb`、`models/bubble-gun.glb`（现为脉冲枪）、`nature/megakit.glb`、`arena/props.glb`、`arena/eye-drone.glb` 及离线 LOD 索引。历史资源不会进入训练场。

---

# 本地三维素材

`public/assets/models/` 中的 8 个 GLB 由 `scripts/generate-assets.mjs` 构建，目前仅加载其中的角色和枪。环境使用 **Quaternius Stylized Nature MegaKit Standard**；木箱、木桶和训练无人机已使用 **Fantasy Props MegaKit Standard / Sci-Fi Essentials Kit Standard** 替换。

角色形象现以[第七印象官方网站](https://www.nailoong.com/)及其[奶龙角色原图](https://www.nailoong.com/_ipx/q_85/img/stars/star_image_nl.png)为直接外形参考：白眼球、绿色虹膜、黑瞳孔、大肚子、连续圆颊与较小笑口、低调棕色爪。已实际查看该官方原图后重建比例；此前 `../experience/assets/` 中的概念画面主要用于花园氛围、围巾和泡泡枪。本地角色仍是自行建模的试验版本，并非下载的官方奶龙模型。官方参考图片没有打包进前端资源。

素材查找时还核实了 Sketchfab 的[奶龙模型 / 78红米](https://sketchfab.com/3d-models/d7a3f20de4e4486182806c40699d26d4)（8,334 面，Free Standard 标记，无纹理）和 [Nailong / The Boy Phase 5](https://sketchfab.com/3d-models/nailong-d4617facf9574b45bc57c64e44497242)（9,998 面，CC BY 4.0 标记，4 张纹理）。已查看实际预览，公开元数据均没有动画，正常下载接口及网页弹窗要求登录。未获取或使用模型数据；候选造型也未作为最终美术验收通过。

## Quaternius 箱桶与无人机 · 2026-11-01

- [Sci-Fi Essentials Kit 作者下载页](https://quaternius.itch.io/sci-fi-essentials-kit)：免费 Standard 原 ZIP 共 37 个 glTF 模型。选用 `Enemy_EyeDrone.gltf`，3,530 三角面，1 材质、3 张原始 2K 贴图、1 骨架、8 关节。保留 Attack、BackFlip、Charging、Hit、Idle、Look 六段动画，当前游戏播放 Idle/Hit。
- [Fantasy Props MegaKit 作者页面](https://quaternius.com/packs/fantasypropsmegakit.html)：免费 Standard 原 ZIP 共 94 个 glTF 模型。选用 `Crate_Wooden.gltf`（1,576 面）和 `Barrel.gltf`（824 面），共享原始 2 材质、6 张 2K 贴图。
- 两套均保留作者原包 CC0 许可，没有使用 Pro/Source。原 ZIP 位于 `.asset-cache/`，不随网页加载。最终文件为 `public/assets/arena/props.glb`、`eye-drone.glb`，同目录含两份许可与记录来源/哈希的 manifest。
- `scripts/prepare-arena-assets.mjs` 保留原几何、纹理和动画，重映射引用并将图片内嵌；箱桶贴图去重。没有把商店宣传渲染图当作运行资源。
- 运行时箱桶缩放至碰撞尺寸并实例化，无人机用 SkeletonUtils.clone 保持独立骨架，材质/纹理共享。反射补光由 Three.js RoomEnvironment 一次性生成，不使用第三方 HDRI 图片。

## Quaternius 环境素材 · 2026-11-01

- 作者：[Quaternius](https://quaternius.com/packs/stylizednaturemegakit.html)。下载：[作者 itch.io 页面](https://quaternius.itch.io/stylized-nature-megakit)。
- 版本：**Stylized Nature MegaKit[Standard].zip**，免费版。没有使用 Pro / Source 的付费模型、引擎项目或 Shader。
- 许可：作者标注 **CC0 1.0**，可用于个人、教学与商业项目；保留包内许可文件及来源信息。
- 资源：从原包挑选树木、灌木、蕨类、草、花、岩石，重新打包为 `public/assets/nature/megakit.glb`，内嵌贴图，运行时不访问作者服务器。
- 处理：保留原几何和贴图，合并资源引用；运行时统一尺寸、设置透明裁切与双面叶片、轻微风动，使用实例化摆放。风动是本项目 Three.js 适配代码，非作者付费 Shader。
- 远山、渐变天空、程序软云、地形与布景由本项目生成，不属于 MegaKit 原包。具体选用模型、原始文件名、文件哈希见同目录 `manifest.json`。

本轮角色改为一张连续梨形曲面，身体与柔软背鳍使用 2 个骨骼蒙皮，脸部和头部动作一致；眼白收窄、绿色虹膜、黑瞳孔、小高光及小笑嘴。去掉原背面粗蓝围巾环和分段胶囊接缝，改为深青色小前巾与短手脚。角色约 39,349 三角面、675 KiB。原型木箱和植物仍保留生成器但不加载；草地色差纹理由本项目生成。

新的脉冲枪由 `scripts/create-pulse-blaster.mjs` 构建，是本项目程序资产，不来自 Sci-Fi 包。奶油白陶瓷壳、深青框架、琥珀能量窗，约 2,472 三角面、4 材质、78.4 KiB；沿用 `bubble-gun.glb` 文件名以兼容加载路径，内容已不是水枪。枪口坐标为 `(0, 0.30, 0.54)`，前方仍为 +Z。

## 历史原型文件和坐标

下表是原生成器的 8 个文件，仅角色和枪仍在加载。原型使用米作为参考单位，Y 轴向上，角色、枪和旧靶面朝向 +Z。奶龙连续身体/背鳍使用蒙皮，四肢和脸部组件保留节点动画；无人机另使用原作者蒙皮骨架。

| 文件 | 用途与约定 |
| --- | --- |
| `public/assets/models/nailong.glb` | 圆润小龙；脚底 y=0，约 2.16 米高；根节点 `DragonRig`；右手挂点 `weapon_socket`。 |
| `public/assets/models/bubble-gun.glb` | 脉冲枪（历史文件名）；根节点 `PulseBlaster` 是握把挂载基点，直接放入 `weapon_socket`；枪口为 `muzzle`。 |
| `public/assets/models/target.glb` | 珊瑚红和奶油色圆靶及木支架；靶心 y=1.25，正面 +Z，半径约 0.56。 |
| `public/assets/models/crate.glb` | 蜂蜜色木箱；约 1.3 米见方；底面 y=0。 |
| `public/assets/models/wall-segment.glb` | 连续奶油色大面的矮墙；宽约 4.02 米，高约 1.24 米，厚约 0.46 米。 |
| `public/assets/models/tree.glb` | 花园树；分块树冠、树干、花朵与根部叶片；高约 3.4 米。 |
| `public/assets/models/bush.glb` | 带小花的灌木；宽约 1.8 米，高约 1 米。 |
| `public/assets/models/rock.glb` | 大小石头组成的小石堆；底面 y=0。 |

精确导出尺寸、字节数、网格数和动画名由脚本写入 `public/assets/models/asset-info.json`。尺寸是渲染包围盒，不应直接当作角色碰撞体；当前角色使用半径 0.5 的独立简化碰撞体。

## 动画和挂载

- `Idle`：2.4 秒，可循环；轻微呼吸、头部和尾巴摆动。
- `Walk`：0.64 秒，可循环；脚步、身体起伏、手臂和尾巴摆动。
- `Aim`：0.30 秒；从休息持枪姿势举枪到位，可用 `LoopOnce` 与 `clampWhenFinished` 保持最后一帧。
- `Shoot`：0.22 秒；双臂短促回弹，枪座向后缩，再回到瞄准姿势。每次射击重置并播放一次；该片段使用普通混合，未设置 additive。
- 用 `mixer.clipAction(clip)` 管理动作并交叉淡入淡出。移动和跳跃的位置由游戏逻辑控制，GLB 动画只负责外形。
- `weapon_socket` 位于右臂节点下。`socket.add(gun.scene)` 后让枪的局部位置和旋转为零、缩放为一即可。
- 发射时更新世界矩阵，再使用 `muzzle.getWorldPosition()` / `muzzle.getWorldQuaternion()` 求枪口位置和朝向；枪的局部前方为 +Z。
- 每个蒙皮实例使用 `SkeletonUtils.clone` 并创建独立 mixer。动画节点名唯一，便于调试和绑定。

## 重新生成

```sh
npm install
npm run assets
```

生成器使用 Three.js 的 `GLTFExporter` 以及一个 Node `FileReader` 适配器，真正导出二进制 glTF 2.0。生成阶段会验证 GLB 文件头、JSON 块、无外部缓冲引用、节点名唯一及动画目标节点存在，并用 `GLTFLoader` 重新载入每个模型；角色还会实际运行四段动画并检查包围盒有效。静态素材按材质合并网格，减少重复摆放木箱、树和墙时的绘制调用。

运行时仍要遍历网格开启 `castShadow` / `receiveShadow`：这些 Three.js 渲染设置不会作为标准 glTF 阴影开关保存。代码构建的模型可继续修改，但最终观感仍需要结合浏览器中的灯光、镜头和动作进行验证。
