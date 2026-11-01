import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Pass the extracted author's Standard directory. No network, dependency install, or author scripts run.
const input=path.resolve(process.argv[2]??'.asset-cache/megakit-standard');
const output=path.resolve('public/assets/nature');
const selected={TreeA:'CommonTree_1',TreeB:'CommonTree_3',TreeC:'CommonTree_5',Pine:'Pine_2',
  Bush:'Bush_Common',Fern:'Fern_1',Grass:'Grass_Common_Short',FlowerA:'Flower_3_Group',
  FlowerB:'Flower_4_Group',RockA:'Rock_Medium_1',RockB:'Rock_Medium_3'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const model={asset:{version:'2.0',generator:'MegaKit Standard selection packer',copyright:'Quaternius — CC0 1.0'},
  scene:0,scenes:[{name:'MegaKitTemplateLibrary',nodes:[]}],nodes:[],meshes:[],accessors:[],bufferViews:[],
  materials:[],textures:[],images:[],samplers:[],buffers:[]};
const binary=[];let byteOffset=0;
const imageCache=new Map(),materialCache=new Map(),textureCache=new Map(),samplerCache=new Map();
const manifest={author:'Quaternius',pack:'Stylized Nature MegaKit Standard',license:'CC0-1.0',
  source:'https://quaternius.itch.io/stylized-nature-megakit',prepared:'2026-11-01',models:[],textures:[]};
function append(bytes){const offset=byteOffset;binary.push(bytes);byteOffset+=bytes.length;const pad=(4-byteOffset%4)%4;if(pad){binary.push(Buffer.alloc(pad));byteOffset+=pad;}return offset;}
function intern(value,cache,list){const key=JSON.stringify(value);if(!cache.has(key)){cache.set(key,list.length);list.push(value);}return cache.get(key);}
for(const [name,file]of Object.entries(selected)){
  const folder=path.join(input,'glTF');const sourceBytes=await fs.readFile(path.join(folder,file+'.gltf'));
  const source=JSON.parse(sourceBytes);
  if(source.extensionsRequired?.length||source.skins?.length||source.animations?.length)throw Error(`Unsupported template: ${file}`);
  const buffers=[];
  for(const b of source.buffers){const bytes=await fs.readFile(path.join(folder,b.uri));if(bytes.length!==b.byteLength)throw Error(`Truncated buffer: ${file}`);buffers.push(append(bytes));}
  const viewOffset=model.bufferViews.length;
  for(const view of source.bufferViews)model.bufferViews.push({...view,buffer:0,byteOffset:buffers[view.buffer]+(view.byteOffset??0)});
  const accessorOffset=model.accessors.length;
  for(const accessor of source.accessors){if(accessor.sparse)throw Error('Sparse accessor not supported');model.accessors.push({...accessor,bufferView:accessor.bufferView+viewOffset});}
  const imageIds=[];
  for(const img of source.images??[]){
    // The author's white leaf masks allow one coherent green palette rather than the red/brown defaults.
    if(img.uri.endsWith('_C.png')){img.uri=img.uri.replace('_C.png','.png');img.name=img.name?.replace('_C','');}
    const bytes=await fs.readFile(path.join(folder,img.uri));const key=hash(bytes);
    if(!imageCache.has(key)){
      const view=model.bufferViews.length;model.bufferViews.push({buffer:0,byteOffset:append(bytes),byteLength:bytes.length});
      imageCache.set(key,model.images.length);model.images.push({name:img.name,mimeType:img.mimeType??'image/png',bufferView:view});
      manifest.textures.push({file:img.uri,bytes:bytes.length,sha256:key});
    }imageIds.push(imageCache.get(key));
  }
  const samplerIds=(source.samplers??[]).map(s=>intern(s,samplerCache,model.samplers));
  const textureIds=(source.textures??[]).map(t=>intern({...t,source:imageIds[t.source],...(t.sampler!==undefined?{sampler:samplerIds[t.sampler]}:{})},textureCache,model.textures));
  function remapTextures(obj){if(!obj||typeof obj!=='object')return;for(const[key,value]of Object.entries(obj)){if(key.endsWith('Texture')&&value&&typeof value==='object'&&'index'in value)value.index=textureIds[value.index];else remapTextures(value);}}
  const materialIds=(source.materials??[]).map(m=>{remapTextures(m);return intern(m,materialCache,model.materials);});
  const meshOffset=model.meshes.length;
  for(const mesh of source.meshes){
    for(const p of mesh.primitives){p.attributes=Object.fromEntries(Object.entries(p.attributes).map(([key,id])=>[key,id+accessorOffset]));if(p.indices!==undefined)p.indices+=accessorOffset;if(p.material!==undefined)p.material=materialIds[p.material];if(p.targets)throw Error('Morph target not supported');}
    model.meshes.push(mesh);
  }
  const nodeOffset=model.nodes.length;
  for(const node of source.nodes){if(node.mesh!==undefined)node.mesh+=meshOffset;if(node.children)node.children=node.children.map(id=>id+nodeOffset);model.nodes.push(node);}
  const wrapper=model.nodes.length;model.nodes.push({name,children:source.scenes[source.scene??0].nodes.map(id=>id+nodeOffset)});model.scenes[0].nodes.push(wrapper);
  manifest.models.push({name,source:`glTF/${file}.gltf`,sha256:hash(sourceBytes)});
}
const bin=Buffer.concat(binary);model.buffers=[{byteLength:bin.length}];
const jsonBytes=Buffer.from(JSON.stringify(model));const json=Buffer.concat([jsonBytes,Buffer.alloc((4-jsonBytes.length%4)%4,0x20)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const glb=Buffer.concat([header,json,binHeader,bin]);
manifest.output={file:'megakit.glb',bytes:glb.length,sha256:hash(glb),meshCount:model.meshes.length,materialCount:model.materials.length,textureCount:model.images.length};
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'megakit.glb'),glb);
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.copyFile(path.join(input,'License_Standard.txt'),path.join(output,'License_Standard.txt'));
console.log(JSON.stringify(manifest.output,null,2));
