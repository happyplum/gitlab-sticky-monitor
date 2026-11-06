import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { createRoot } from 'react-dom/client';
import { StickyNote } from '../src/windows/StickyNote';
import '../src/styles/global.css';

const note = { id:'note-race', kind:'custom', color:'#FFFACD', is_open:true, always_on_top:true,
  position:{x:100,y:100},size:{w:340,h:450},document:{root:{type:'root',version:1,format:'',indent:0,direction:null,
    children:[{type:'paragraph',version:1,format:'',indent:0,direction:null,textFormat:0,textStyle:'',children:[]}]}}};
const state = { hold:'', held:0, releases:[] as (()=>void)[], acks:[] as any[], note, emit,
  release() { state.hold=''; state.releases.splice(0).forEach(resolve=>resolve()); } };
Object.assign(window, { __race:state });
mockWindows(note.id);
mockIPC(async(command,args:any={})=>{
  if(command===state.hold){state.held++;await new Promise<void>(resolve=>state.releases.push(resolve));}
  switch(command){
    case 'get_note_config':return structuredClone(note);
    case 'save_note_document':note.document=args.document;return;
    case 'hide_note':note.is_open=false;return;
    case 'acknowledge_exit':state.acks.push(args);return;
    case 'update_note_position':note.position={x:args.x,y:args.y};return;
    case 'update_note_size':note.size={w:args.w,h:args.h};return;
    case 'plugin:window|is_focused':return true;
    case 'plugin:window|scale_factor':return 1;
    default:return null;
  }
},{shouldMockEvents:true});
createRoot(document.getElementById('root')!).render(<StickyNote noteId={note.id}/>);
