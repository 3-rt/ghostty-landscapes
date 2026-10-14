// Render the translated Ghostty shader offscreen without controlling Ghostty.
import Foundation
import Metal
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let device = MTLCreateSystemDefaultDevice()!
let source = try String(contentsOf: root.appendingPathComponent("check.metal"), encoding: .utf8)
let vertex = """
vertex float4 fullscreen(uint id [[vertex_id]]) {
 float2 p[3]={float2(-1,-1),float2(3,-1),float2(-1,3)};
 return float4(p[id],0,1);
}
"""
let library = try device.makeLibrary(source: source + "\n" + vertex, options: nil)
let desc = MTLRenderPipelineDescriptor()
desc.vertexFunction = library.makeFunction(name:"fullscreen")
desc.fragmentFunction = library.makeFunction(name:"main0")
desc.colorAttachments[0].pixelFormat = .rgba8Unorm
let pipeline = try device.makeRenderPipelineState(descriptor:desc)
let queue = device.makeCommandQueue()!
let sd = MTLSamplerDescriptor();sd.minFilter = .linear;sd.magFilter = .linear
let sampler = device.makeSamplerState(descriptor:sd)!
let url = URL(fileURLWithPath: CommandLine.arguments[2])
let image = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(url as CFURL,nil)!,0,nil)!
let colorSpace = CGColorSpaceCreateDeviceRGB()
func check(width:Int,height:Int) throws {
 let count=width*height*4
 var input=[UInt8](repeating:0,count:count)
 input.withUnsafeMutableBytes { bytes in
  let c=CGContext(data:bytes.baseAddress,width:width,height:height,bitsPerComponent:8,bytesPerRow:width*4,space:colorSpace,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
  let scale=max(Double(width)/1672,Double(height)/941)
  c.draw(image,in:CGRect(x:(Double(width)-1672*scale)/2,y:(Double(height)-941*scale)/2,width:1672*scale,height:941*scale))
 }
 let bg:[Double]=[35,33,54]
 for i in stride(from:0,to:count,by:4){for j in 0..<3{input[i+j]=UInt8((Double(input[i+j]) * 0.18 + bg[j] * 0.82)*0.8)};input[i+3]=204}
 // Opaque UI and anti-aliased colored glyph samples across sky, buildings, river.
 for y in 30..<height-30 where y%61<3 {
  for x in 30..<min(width-30,650) where x%19<12 {
   let i=(y*width+x)*4, a:UInt8 = x%5==0 ? 210 : 255
   input[i]=UInt8(Int(a)*3/4);input[i+1]=a;input[i+2]=UInt8(Int(a)/2);input[i+3]=a
  }
 }
 let td=MTLTextureDescriptor.texture2DDescriptor(pixelFormat:.rgba8Unorm,width:width,height:height,mipmapped:false)
 td.storageMode = .shared;td.usage=[.shaderRead,.renderTarget]
 let texture=device.makeTexture(descriptor:td)!,output=device.makeTexture(descriptor:td)!
 input.withUnsafeBytes{texture.replace(region:MTLRegionMake2D(0,0,width,height),mipmapLevel:0,withBytes:$0.baseAddress!,bytesPerRow:width*4)}
 var uniforms=[Float](repeating:0,count:2048);uniforms[0]=Float(width);uniforms[1]=Float(height);uniforms[2]=1
 func render(_ time:Float)->([UInt8],Double){
  uniforms[3]=time
  let pass=MTLRenderPassDescriptor();pass.colorAttachments[0].texture=output;pass.colorAttachments[0].loadAction = .clear;pass.colorAttachments[0].storeAction = .store
  let command=queue.makeCommandBuffer()!,encoder=command.makeRenderCommandEncoder(descriptor:pass)!
  encoder.setRenderPipelineState(pipeline);encoder.setFragmentTexture(texture,index:0);encoder.setFragmentSamplerState(sampler,index:0)
  uniforms.withUnsafeBytes{encoder.setFragmentBytes($0.baseAddress!,length:$0.count,index:1)}
  encoder.drawPrimitives(type:.triangle,vertexStart:0,vertexCount:3);encoder.endEncoding();command.commit();command.waitUntilCompleted()
  if let error=command.error{fatalError("GPU render failed: \(error)")}
  var result=[UInt8](repeating:0,count:count)
  result.withUnsafeMutableBytes{output.getBytes($0.baseAddress!,bytesPerRow:width*4,from:MTLRegionMake2D(0,0,width,height),mipmapLevel:0)}
  return (result,(command.gpuEndTime-command.gpuStartTime)*1000)
 }
 let (start,_)=render(0);let (middle,ms)=render(8);let (end,_)=render(192)
 guard start==end else{fatalError("Loop mismatch")}
 let (beforeSeam,_)=render(191.99), (afterSeam,_)=render(0.01), (nearStart,_)=render(0.02)
 func distance(_ a:[UInt8],_ b:[UInt8])->Int {var sum=0;for i in stride(from:0,to:count,by:4){for k in 0..<3{sum += abs(Int(a[i+k])-Int(b[i+k]))}};return sum}
 guard distance(beforeSeam,afterSeam)<=4*distance(start,nearStart)+5000 else{fatalError("Visible jump at loop seam")}
 var moved=0,protected=0
 for i in stride(from:0,to:count,by:4){
  guard start[i+3]==input[i+3],middle[i+3]==input[i+3] else{fatalError("Transparency changed")}
  if input[i+3]>204 {protected += 1;for c in 0..<4{guard start[i+c]==input[i+c],middle[i+c]==input[i+c] else{fatalError("Terminal pixels changed")}}}else if start[i] != middle[i]{moved += 1}
 }
 guard moved>100 else{fatalError("Animation invisible")}
 if root.lastPathComponent == "coast" {
  let scale=max(Double(width)/1672,Double(height)/941), ox=(Double(width)-1672*scale)/2, oy=(Double(height)-941*scale)/2
  let x0=max(0,Int(430*scale+ox)),x1=min(width,Int(510*scale+ox)),y0=max(0,Int(505*scale+oy)),y1=min(height,Int(534*scale+oy))
  for y in y0..<y1 {for x in x0..<x1 {let i=(y*width+x)*4;for k in 0..<4{guard start[i+k]==middle[i+k] else{fatalError("Coast island moved under clouds")}}}}
 }
 var mismatch=input;for i in stride(from:0,to:count,by:4) where mismatch[i+3]==204 {mismatch[i+3]=179}
 mismatch.withUnsafeBytes{texture.replace(region:MTLRegionMake2D(0,0,width,height),mipmapLevel:0,withBytes:$0.baseAddress!,bytesPerRow:width*4)}
 guard render(8).0==mismatch else{fatalError("Changed pixels with mismatched opacity")}
 input.withUnsafeBytes{texture.replace(region:MTLRegionMake2D(0,0,width,height),mipmapLevel:0,withBytes:$0.baseAddress!,bytesPerRow:width*4)}
 var times=[Double]();for n in 0..<10{times.append(render(Float(n)/30).1)}
 func save(_ bytes:[UInt8],_ name:String){
  let data=Data(bytes),provider=CGDataProvider(data:data as CFData)!
  let cg=CGImage(width:width,height:height,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:width*4,space:colorSpace,bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),provider:provider,decode:nil,shouldInterpolate:false,intent:.defaultIntent)!
  let destination=CGImageDestinationCreateWithURL(root.appendingPathComponent(name) as CFURL,UTType.png.identifier as CFString,1,nil)!
  CGImageDestinationAddImage(destination,cg,nil);CGImageDestinationFinalize(destination)
 }
 save(start,"metal-\(width)-0.png");save(middle,"metal-\(width)-8.png")
 print("PASS \(width)x\(height): \(protected) protected UI pixels unchanged; alpha preserved; \(moved) moving pixels; loop closes. GPU median \(times.sorted()[5]) ms (sample \(ms) ms).")
}
try check(width:1672,height:941)
try check(width:900,height:1100)
print("Native Metal pipeline passed on \(device.name). Live Ghostty reload still required.")
