const parts=value=>{const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);return match?{year:+match[1],month:+match[2],day:+match[3],hour:+match[4],minute:+match[5],second:+(match[6]||0)}:null}
const validDate=p=>p&&p.year>=1901&&p.month>=1&&p.month<=12&&p.day>=1&&p.day<=31
const validTime=p=>p&&p.hour>=0&&p.hour<=23&&p.minute>=0&&p.minute<=59
const dateLabel=p=>`${String(p.day).padStart(2,'0')}/${String(p.month).padStart(2,'0')}/${p.year}`
const timeLabel=p=>`${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`

export const isArtificialSheetDate=value=>{const p=parts(value);return Boolean(p&&p.year<=1900&&validTime(p))}

export function operationTimeline(row){
  const base=parts(row.data_hora),baseValid=validDate(base)
  const point=value=>{const p=parts(value);if(!validTime(p))return null;if(validDate(p))return{label:`${dateLabel(p)} ${timeLabel(p)}`,minutes:Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute)/60000,hasDate:true};if(baseValid)return{label:`${dateLabel(base)} ${timeLabel(p)}`,minutes:Date.UTC(base.year,base.month-1,base.day,p.hour,p.minute)/60000,hasDate:true};return{label:timeLabel(p),minutes:p.hour*60+p.minute,hasDate:false}}
  let initial=point(row.hora_inicial),final=point(row.hora_final)
  if(!initial&&!final&&baseValid)initial=point(row.data_hora)
  let duration=null,crossedMidnight=false
  if(initial&&final){let endMinutes=final.minutes;if(endMinutes<initial.minutes){endMinutes+=1440;crossedMidnight=true}duration=Math.max(0,endMinutes-initial.minutes)}
  return{initial,final,duration,crossedMidnight,valid:Boolean(initial||final)}
}

export function durationLabel(minutes){if(minutes==null||!Number.isFinite(minutes))return null;const value=Math.round(minutes),hours=Math.floor(value/60),rest=value%60;return hours?`${hours}h ${String(rest).padStart(2,'0')}min`:`${rest}min`}

export function deliveryInPeriod(card,from,to){const value=String(card.data_entrega||'').slice(0,10);if(!from&&!to)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;return(!from||value>=from)&&(!to||value<=to)}

