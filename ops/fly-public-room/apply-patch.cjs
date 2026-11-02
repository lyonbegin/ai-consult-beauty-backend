// Append-only patch for the EXACT deployed webrtc-new Docker image.
// Never modifies auth, tests keys, mediasoup config, ports, or the Fly machine.
const fs = require('node:fs');
const path = require('node:path');
const root = '/app/dist';
function replaceOnce(file, original, replacement) {
  let text = fs.readFileSync(file,'utf8');
  if (text.split(original).length!==2) throw new Error('Unexpected live build layout: '+file+' anchor '+original.slice(0,70));
  fs.writeFileSync(file,text.replace(original,replacement));
}
const moduleFile=path.join(root,'app.module.js');
replaceOnce(moduleFile,
  'const telemedicine_module_1 = require("./telemedicine/telemedicine.module");',
  'const telemedicine_module_1 = require("./telemedicine/telemedicine.module");\nconst public_rooms_module_1 = require("./public-rooms/public-rooms.module");');
replaceOnce(moduleFile,
  '            telemedicine_module_1.TelemedicineModule,',
  '            telemedicine_module_1.TelemedicineModule,\n            public_rooms_module_1.PublicRoomsModule,');
const dir=path.join(root,'public-rooms');fs.mkdirSync(dir,{recursive:true});
const runtime=`"use strict";
require('reflect-metadata');
const {
  BadRequestException, ForbiddenException, Injectable,
  Controller, Get, Post, Param, Body, Req, UseGuards, Module,
  NotFoundException
}=require('@nestjs/common');
const {SessionService}=require('../realtime/session.service');
const {RealtimeModule}=require('../realtime/realtime.module');
const {AuthModule}=require('../auth/auth.module');
const {HttpJwtGuard}=require('../auth/http-jwt.guard');

// Reuse the original in-memory session map and existing mediasoup Router.
if(!SessionService.prototype.listByType) {
  SessionService.prototype.listByType=function(type) {
    return Array.from(this.sessions.values()).filter(s=>s.type===type);
  };
}
const originalMarkReady=SessionService.prototype.markReady;
SessionService.prototype.markReady=function(id,userId,ready) {
  const originalState=this.require(id).status;
  const result=originalMarkReady.call(this,id,userId,ready);
  if(originalState==='LIVE')this.require(id).status='LIVE';
  return result;
};
const originalLeave=SessionService.prototype.leave;
SessionService.prototype.leave=function(id,userId) {
  const session=this.require(id);
  const participant=session.participants.get(userId);
  const result=originalLeave.call(this,id,userId);
  if(session.type==='PUBLIC_ROOM'&&participant?.role==='GUEST')
    session.participants.delete(userId);
  return result;
};
class PublicRoomsService {
  constructor(sessions) { this.sessions=sessions; }
  room(id) {
    const room=this.sessions.get(id);
    if(!room||room.type!=='PUBLIC_ROOM')throw new NotFoundException('Public room not found');
    return room;
  }
  list() {
    return this.sessions.listByType('PUBLIC_ROOM')
      .filter(s=>s.status!=='ENDED'&&s.status!=='CANCELLED')
      .map(s=>this.sessions.toPublic(s));
  }
  get(id) {
    const s=this.room(id);
    if(s.status==='ENDED'||s.status==='CANCELLED')throw new NotFoundException('Public room is closed');
    return this.sessions.toPublic(s);
  }
  async create(body,actor) {
    const title=typeof body?.title==='string'?body.title.trim():'';
    const size=body?.maxParticipants===undefined?8:body.maxParticipants;
    if(!title||title.length>100)throw new BadRequestException('Room title must be 1-100 characters');
    if(!Number.isInteger(size)||size<2||size>32)throw new BadRequestException('maxParticipants must be between 2 and 32');
    if(!actor?.sub)throw new ForbiddenException('Login required');
    const policy={topology:'MANY_TO_MANY',maxParticipants:size,
      maxVideoPublishers:size,maxAudioPublishers:size,
      waitingRoom:false,requireHostStart:false,
      allowUnlistedParticipants:true,allowRejoinAfterEnd:false};
    const s=this.sessions.create({
      type:'PUBLIC_ROOM',title,hostUserIds:[actor.sub],
      participants:[{userId:actor.sub,displayName:actor.name,role:'HOST',
        permissions:{publishAudio:true,publishVideo:true,
          consumeAudio:true,consumeVideo:true,shareScreen:true,
          manageSession:true,manageParticipants:true}}],
      policy
    });
    try {await this.sessions.start(s.id,actor.sub);}
    catch(e){
      const failed=this.sessions.get(s.id);
      if(failed&&!failed.rtcRoomId&&failed.status!=='LIVE')this.sessions.sessions.delete(s.id);
      throw e;
    }
    return this.sessions.toPublic(s);
  }
}
Reflect.defineMetadata('design:paramtypes',[SessionService],PublicRoomsService);
Injectable()(PublicRoomsService);

class PublicRoomsController{
  constructor(rooms){this.rooms=rooms}
  list(){return this.rooms.list()}
  create(req,body){return this.rooms.create(body,req.auth)}
  get(id){return this.rooms.get(id)}
}
Reflect.defineMetadata('design:paramtypes',[PublicRoomsService],PublicRoomsController);
for(const [name,deco] of [['list',Get()],['create',Post()],['get',Get(':id')]]) {
  const desc=Object.getOwnPropertyDescriptor(PublicRoomsController.prototype,name);
  deco(PublicRoomsController.prototype,name,desc);
}
Req()(PublicRoomsController.prototype,'create',0);
Body()(PublicRoomsController.prototype,'create',1);
Param('id')(PublicRoomsController.prototype,'get',0);
Controller('public-rooms')(PublicRoomsController);
UseGuards(HttpJwtGuard)(PublicRoomsController);

class PublicRoomsModule{}
Module({imports:[AuthModule,RealtimeModule],controllers:[PublicRoomsController],
  providers:[PublicRoomsService]})(PublicRoomsModule);
exports.PublicRoomsModule=PublicRoomsModule;
exports.PublicRoomsService=PublicRoomsService;
`;
fs.writeFileSync(path.join(dir,'public-rooms.module.js'),runtime);
const auth=fs.readFileSync(path.join(root,'auth','auth.controller.js'),'utf8');
if(!auth.includes('TEST_LOGIN_KEY'))throw new Error('Original production auth patch not found; ABORT');
const media=fs.readFileSync(path.join(root,'mediasoup','transport.service.js'),'utf8');
if(!media.includes('slot.webRtcServer'))throw new Error('Original single-port mediasoup setup missing; ABORT');
console.log('Patched public room controller; retained original auth & shared WebRtcServer.');
