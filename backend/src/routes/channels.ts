import { Router } from 'express';
import channelsApi from '../api/channels';
import middleware from '../middleware';

const router = Router();
router.use(middleware.jwtCheck);

router.get('/', channelsApi.listChannels);
router.post('/', channelsApi.createChannel);
router.post('/direct/:userId', channelsApi.openDirectChannel);
router.get('/:id', channelsApi.getChannel);
router.put('/:id', channelsApi.updateChannel);
router.post('/:id/archive', channelsApi.archiveChannel);
router.post('/:id/leave', channelsApi.leaveChannel);
router.post('/:id/members', channelsApi.inviteMember);
router.delete('/:id/members/:userId', channelsApi.removeMember);
router.get('/:id/messages', channelsApi.listMessages);
router.post('/:id/messages', channelsApi.sendMessage);
router.delete('/:id/messages/:messageId', channelsApi.deleteMessage);
router.post('/:id/summary', channelsApi.generateSummary);
router.post('/:id/media', channelsApi.generateMedia);

export default router;
