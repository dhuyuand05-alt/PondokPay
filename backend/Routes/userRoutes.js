import express from 'express';
import {
  createUser,
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser,
} from '../controllers/userController.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { auditMutation } from '../middleware/security.js';

const router = express.Router();

router.use(authenticateToken);
router.use(auditMutation);

router.get('/', authorizeRoles('admin'), getAllUsers);
router.get('/:id', authorizeRoles('admin'), getUserById);
router.post('/', authorizeRoles('admin'), createUser);
router.put('/:id', authorizeRoles('admin'), updateUser);
router.patch('/:id', authorizeRoles('admin'), updateUser);
router.delete('/:id', authorizeRoles('admin'), deleteUser);

export default router;
