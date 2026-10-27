import { generateGeoPDF } from './services/pdfkitGeoPDF.js'
import fs from 'fs'
const V = [[-97267.17,-2247924.77],[-97318.4,-2248011.1],[-97198.8,-2248084.5],[-97250,-2248170],[-97456.1,-2248046.3],[-97349.5,-2247875.5]]
const ring = V.map(([x,y]) => ({ y: -x, x: -y }))
const names = ['M27','C3','C2','C1','M43','M44']
const edges = ring.map((v,i)=>{const w=ring[(i+1)%ring.length];return {side:names[i]+names[(i+1)%ring.length],metres:Math.hypot(w.y-v.y,w.x-v.x).toFixed(2),direction:'0°00\'00"',constants:'',y:v.y,x:v.x}})
const cx = ring.reduce((a,r)=>a+r.y,0)/6, cy = ring.reduce((a,r)=>a+r.x,0)/6
const N=118,R=50
const stands = Array.from({length:N},(_,i)=>{const y0=cx-100+(i%12)*15, x0=cy-100+Math.floor(i/12)*15;return {type:'Feature',geometry:{type:'Polygon',coordinates:[[[y0,x0],[y0+12,x0],[y0+12,x0+12],[y0,x0+12],[y0,x0]]]},properties:{stand:String(1665+i),area_m2:300+i}}})
const rows = Array.from({length:R},(_,i)=>({stands:`${1900+2*i}, ${1901+2*i}`,boundary:`${1900+2*i}A - ${1901+2*i}B`}))
const plan = {
  metadata:{designation:'Stands 1665 - 1685 MAGLAS',township:'MAGLAS',district:'SHABANI',centralMeridian:31,wholePortion:'A portion',servitudeStatement:{rows},planType:'general-developed'},
  parcels:{type:'FeatureCollection',features:stands},
  beacons:{type:'FeatureCollection',features:ring.map((r,i)=>({type:'Feature',geometry:{type:'Point',coordinates:[r.y,r.x]},properties:{name:names[i],type:'iron-peg'}}))},
  outsideFigureData:{edges,coordinates:ring.map((r,i)=>({name:names[i],y:r.y,x:r.x}))},
  scale:'1:500', sheetSize:'SI727_1000x800', planType:'general-developed', sheetInfo:{sheetNumber:1,totalSheets:2,otherSheets:'sheet 2'},
}
const keep=/Final dynamic|Dynamic block|servitude|schedule.*(width|seated|composite)|Schedule seated/i
const lg={info:(m)=>{m=typeof m==='string'?m:JSON.stringify(m);keep.test(m)&&console.log(m.slice(0,600))},warn:(m)=>{m=typeof m==='string'?m:JSON.stringify(m);keep.test(m)&&console.log('W',m.slice(0,300))},error(){},debug(){}}
const r = await generateGeoPDF(plan, lg)
fs.writeFileSync(process.argv[2], r.pdfBuffer||r.buffer)
console.log(r.scale, r.sheetSize)
