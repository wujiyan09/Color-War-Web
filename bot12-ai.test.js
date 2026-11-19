import { test, expect } from "bun:test";
import { Bot12Solver } from "./bot12-ai.js";
const empty=n=>Array.from({length:n},()=>Array.from({length:n},()=>({owner:null,count:0})));
test("opening takes center on empty board",()=>{
  const m=new Bot12Solver({boardSize:5,activePlayers:[0,1],currentPlayer:0,playerType:"mathNightmare",aiLevel:2,board:empty(5),hasEntered:[false,false],eliminated:[false,false]}).calculateBestMove();
  expect(m).toEqual({r:2,c:2});
});
for (const lvl of [1,2,3]) test("returns own legal move level "+lvl,()=>{
  const b=empty(6); b[1][1]={owner:0,count:3}; b[1][2]={owner:1,count:3}; b[4][4]={owner:0,count:1}; b[3][3]={owner:1,count:2};
  const m=new Bot12Solver({boardSize:6,activePlayers:[0,1],currentPlayer:0,playerType:"enhancedNightmare",aiLevel:lvl,board:b,hasEntered:[true,true],eliminated:[false,false]}).calculateBestMove();
  expect(b[m.r][m.c].owner).toBe(0);
});
test("multiplayer MaxN path legal",()=>{
  const b=empty(6); b[0][0]={owner:0,count:2}; b[5][5]={owner:1,count:3}; b[2][3]={owner:2,count:1}; b[3][0]={owner:0,count:3};
  const m=new Bot12Solver({boardSize:6,activePlayers:[0,1,2],currentPlayer:0,playerType:"mathNightmare",aiLevel:2,board:b,hasEntered:[true,true,true],eliminated:[false,false,false]}).calculateBestMove();
  expect(b[m.r][m.c].owner).toBe(0);
});
