import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../app/page.jsx';
import {EditorView} from '@codemirror/view';
let root;
export {act,EditorView};
export async function mount(){await act(async()=>{root=createRoot(document.querySelector('#root'));root.render(<Home/>);});}
export async function unmount(){await act(async()=>{root?.unmount();});}
