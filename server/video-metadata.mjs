// Bounded ISO-BMFF inspection. This verifies MP4 structure and track metadata,
// not that every encoded frame can be decoded; browser playback is checked next.
export function mp4Metadata(bytes){
 const boxes=(from,to)=>{const out=[];for(let at=from;at<to;){if(at+8>to)throw Error('Truncated MP4 box.');let size=bytes.readUInt32BE(at),header=8;const type=bytes.toString('ascii',at+4,at+8);if(size===1){if(at+16>to)throw Error('Truncated extended box.');size=Number(bytes.readBigUInt64BE(at+8));header=16;}if(size===0)size=to-at;if(!Number.isSafeInteger(size)||size<header||at+size>to)throw Error('Invalid MP4 box length.');out.push({type,from:at+header,to:at+size});at+=size;}return out;};
 const top=boxes(0,bytes.length),moov=top.find(b=>b.type==='moov');if(!moov||!top.some(b=>b.type==='mdat'))throw Error('Missing MP4 media.');
 for(const trak of boxes(moov.from,moov.to).filter(b=>b.type==='trak')){
  const children=boxes(trak.from,trak.to),mdia=children.find(b=>b.type==='mdia'),tkhd=children.find(b=>b.type==='tkhd');if(!mdia||!tkhd)continue;
  const media=boxes(mdia.from,mdia.to),handler=media.find(b=>b.type==='hdlr'),mdhd=media.find(b=>b.type==='mdhd');
  if(!handler||handler.to-handler.from<12||bytes.toString('ascii',handler.from+8,handler.from+12)!=='vide')continue;
  if(!mdhd||tkhd.to-tkhd.from<8)throw Error('Missing MP4 video metadata.');const version=bytes[mdhd.from],offset=mdhd.from+(version===1?20:12);
  if(![0,1].includes(version)||offset+(version===1?12:8)>mdhd.to)throw Error('Invalid MP4 timing.');
  const scale=bytes.readUInt32BE(offset),ticks=version===1?Number(bytes.readBigUInt64BE(offset+4)):bytes.readUInt32BE(offset+4),duration=ticks/scale;
  const width=bytes.readUInt32BE(tkhd.to-8)/65536,height=bytes.readUInt32BE(tkhd.to-4)/65536;
  if(!Number.isFinite(duration)||duration<=0||duration>30||width<1||height<1||width>8192||height>8192)throw Error('Unsupported MP4 dimensions or duration.');
  return {duration,width,height};
 }
 throw Error('No video track in MP4.');
}
