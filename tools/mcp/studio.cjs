const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { execFile } = require("node:child_process");
const { constants } = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execute = promisify(execFile);
const root = path.resolve(__dirname, "../..");
const game = path.join(root, "game");
const art = path.join(root, "art");
const models = path.join(game, "assets", "models");
const [mode, executable] = process.argv.slice(2);
if (!["blender", "godot"].includes(mode) || !executable || !path.isAbsolute(executable)) {
  throw new Error("Usage: node studio.cjs blender|godot ABSOLUTE_ENGINE_EXECUTABLE");
}
const server = new McpServer({ name: "hw3-" + mode, version: "1.0.0" });
const assetName = z.string().regex(/^[a-z][a-z0-9_]{0,48}$/);
const relativeFile = z.string().min(1).max(240);
const vector = (min, max) => z.array(z.number().finite().min(min).max(max)).length(3);
const position = vector(-1000, 1000);
const scale = vector(0.001, 1000);
const degrees = vector(-360, 360);
const transform = { position, rotation_degrees: degrees, scale };
const marker = "HW3_STUDIO_RESULT ";

function within(base, file) {
  const rel = path.relative(base, file);
  return rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}

async function inputFile(base, reference, extension) {
  if (path.isAbsolute(reference) || reference.includes(":") || path.extname(reference).toLowerCase() !== extension) {
    throw new Error("Use a project-relative path ending in " + extension);
  }
  const candidate = await fs.realpath(path.resolve(base, reference));
  if (!within(await fs.realpath(root), candidate) || !within(path.resolve(base), candidate)) {
    throw new Error("Input is outside its project asset directory.");
  }
  return candidate;
}

async function publish(tempFile, output) {
  // Resolve each parent before creating its child, including on Windows junctions.
  let parent = root;
  for (const segment of path.relative(root, path.dirname(output)).split(path.sep)) {
    parent = path.join(parent, segment);
    try { await fs.mkdir(parent); } catch (err) { if (err.code !== "EEXIST") throw err; }
    if (!within(await fs.realpath(root), await fs.realpath(parent))) {
      throw new Error("Output directory points outside HW3.");
    }
  }
  await fs.copyFile(tempFile, output, constants.COPYFILE_EXCL);
  return path.relative(root, output).split(path.sep).join("/");
}

async function run(args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|PATH|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|SYSTEMDRIVE|HOMEDRIVE|HOMEPATH|LANG|LC_ALL|NUMBER_OF_PROCESSORS)$/i.test(key)));
  const { stdout, stderr } = await execute(executable, args, {
    cwd: root, windowsHide: true, timeout: 90000, maxBuffer: 4 * 1024 * 1024, env
  });
  const log = stdout + "\n" + stderr;
  if (/^(SCRIPT ERROR|ERROR):/m.test(log)) throw new Error(log.split("\n").filter(line => /error/i.test(line)).slice(0, 12).join("\n"));
  return log.trim();
}

async function transaction(work) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "hw3-studio-"));
  try { return await work(temp); }
  finally { await fs.rm(temp, { recursive: true, force: true }); }
}

async function worker(temp, request) {
  const input = path.join(temp, "request.json");
  await fs.writeFile(input, JSON.stringify(request), { encoding: "utf8", flag: "wx" });
  const args = mode === "blender"
    ? ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", path.join(__dirname, "blender_ops.py"), "--", input]
    : ["--headless", "--log-file", path.join(temp, "engine.log"), "--path", game, "--script", path.join(__dirname, "godot_ops.gd"), "--", input];
  const log = await run(args);
  const result = log.split(/\r?\n/).find(line => line.startsWith(marker));
  if (!result) throw new Error(log.slice(-3000) || "The engine returned no result.");
  return JSON.parse(result.slice(marker.length));
}

function tool(name, description, input, handler) {
  server.registerTool(name, { description, inputSchema: z.strictObject(input) }, async args => {
    try {
      const value = await handler(args);
      return { content: [{ type: "text", text: JSON.stringify(value) }] };
    } catch (err) {
      const message = [err.message, err.stderr, err.stdout].filter(Boolean).join("\n");
      return { isError: true, content: [{ type: "text", text: message.slice(-4500) }] };
    }
  });
}

tool("version", "Read the installed engine version.", {}, async () => {
  const log = await run(["--version"]);
  return { engine: mode, version: log.split(/\r?\n/)[0] };
});

if (mode === "blender") {
  tool("compose_prop", "Create a named low-poly prop from primitives in art/mcp. Coordinates use Blender Z-up and metres.", {
    name: assetName,
    parts: z.array(z.strictObject({
      name: assetName, primitive: z.enum(["cube", "icosphere", "cylinder", "cone"]),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/), ...transform
    })).min(1).max(128)
  }, args => transaction(async temp => {
    const out = path.join(temp, "prop.blend");
    const info = await worker(temp, { action: "compose", parts: args.parts, out });
    return { ...info, file: await publish(out, path.join(art, "mcp", args.name + ".blend")) };
  }));

  tool("inspect_scene", "Read object, polygon and material information from a .blend file relative to art/.", {
    file: relativeFile
  }, async args => transaction(async temp => worker(temp, {
    action: "inspect", source: await inputFile(art, args.file, ".blend")
  })));

  tool("transform_copy", "Edit a named object position/rotation/scale; save a new .blend in art/mcp.", {
    file: relativeFile, object: z.string().min(1).max(80), name: assetName, ...transform
  }, args => transaction(async temp => {
    const out = path.join(temp, "edited.blend");
    const info = await worker(temp, { ...args, action: "transform", source: await inputFile(art, args.file, ".blend"), out });
    return { ...info, file: await publish(out, path.join(art, "mcp", args.name + ".blend")) };
  }));

  tool("export_glb", "Export an art/ Blender source as a new glTF binary in game/assets/models/mcp/.", {
    file: relativeFile, name: assetName
  }, args => transaction(async temp => {
    const out = path.join(temp, "model.glb");
    await worker(temp, { action: "export", source: await inputFile(art, args.file, ".blend"), out });
    return { file: await publish(out, path.join(models, "mcp", args.name + ".glb")) };
  }));
} else {
  tool("import_project", "Import project resources with Godot's headless editor.", {}, () =>
    transaction(async temp => ({ log: (await run(["--headless", "--log-file", path.join(temp, "engine.log"), "--path", game, "--import"])).slice(-2400) })));

  tool("compose_scene", "Create a Godot PackedScene in game/scenes/mcp from existing imported GLBs. Coordinates use Godot Y-up and metres.", {
    name: assetName, instances: z.array(z.strictObject({
      name: assetName, model: relativeFile, ...transform
    })).min(1).max(128)
  }, args => transaction(async temp => {
    if (new Set(args.instances.map(item => item.name)).size !== args.instances.length) throw new Error("Choose unique instance names.");
    const instances = await Promise.all(args.instances.map(async item => {
      const model = await inputFile(models, item.model, ".glb");
      return { ...item, model: "res://" + path.relative(game, model).split(path.sep).join("/") };
    }));
    const out = path.join(temp, "scene.tscn");
    const info = await worker(temp, { name: args.name, instances, out });
    return { ...info, file: await publish(out, path.join(game, "scenes", "mcp", args.name + ".tscn")) };
  }));

  tool("run_scene", "Run the game or a res-relative .tscn for a bounded number of frames in Godot.", {
    scene: relativeFile.optional(), frames: z.number().int().min(1).max(300).default(30)
  }, args => transaction(async temp => {
    const runArgs = ["--headless", "--log-file", path.join(temp, "engine.log"), "--path", game, "--quit-after", String(args.frames)];
    if (args.scene) {
      const file = await inputFile(game, args.scene, ".tscn");
      runArgs.push("res://" + path.relative(game, file).split(path.sep).join("/"));
    }
    return { frames: args.frames, log: (await run(runArgs)).slice(-2400) };
  }));
}

server.connect(new StdioServerTransport()).catch(err => { console.error(err.message); process.exitCode = 1; });
