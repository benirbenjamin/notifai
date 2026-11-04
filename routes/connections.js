/**
 * Connections Routes
 * Handles user connections/friendships
 */

const express = require('express');
const router = express.Router();
const Connection = require('../models/Connection');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /connections - Friends dashboard
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    console.log('User ID from session:', req.session.user?.id);
    const friends = await Connection.getFriends(req.session.user.id) || [];
    const pendingRequests = await Connection.getPendingRequests(req.session.user.id) || [];
    const sentRequests = await Connection.getSentRequests(req.session.user.id) || [];
    
    console.log('Friends data:', friends);
    console.log('Pending requests:', pendingRequests);
    
    res.render('connections/index', {
      title: 'Friends & Connections',
      friends,
      pendingRequests,
      sentRequests,
      user: req.session.user
    });

  } catch (error) {
    console.error('Error loading connections:', error);
    res.render('error', {
      title: 'Error',
      message: 'Failed to load connections',
      user: req.session.user
    });
  }
});

/**
 * GET /connections/search - Search users
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    console.log('=== SEARCH ROUTE START ===');
    
    // Simple test first - just render the page with empty users array
    res.render('connections/search', {
      title: 'Find Friends',
      query: '',
      users: [],
      user: req.session.user,
      showingAll: true
    });
    console.log('=== SEARCH ROUTE END ===');

  } catch (error) {
    console.error('=== SEARCH ROUTE ERROR ===');
    console.error('Error searching users:', error);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
    res.render('error', {
      title: 'Error',
      message: 'Failed to search users',
      user: req.session.user
    });
  }
});

/**
 * POST /connections/request - Send friend request
 */
router.post('/request', requireAuth, async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    if (userId == req.session.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot send friend request to yourself' 
      });
    }

    await Connection.sendRequest(req.session.user.id, userId, message);

    res.json({ 
      success: true, 
      message: 'Friend request sent successfully' 
    });

  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to send friend request' 
    });
  }
});

/**
 * POST /connections/accept/:id - Accept friend request
 */
router.post('/accept/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const success = await Connection.acceptRequest(id, req.session.user.id);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Friend request accepted' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Friend request not found or already processed' 
      });
    }

  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to accept friend request' 
    });
  }
});

/**
 * POST /connections/reject/:id - Reject friend request
 */
router.post('/reject/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const success = await Connection.rejectRequest(id, req.session.user.id);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Friend request rejected' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Friend request not found' 
      });
    }

  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reject friend request' 
    });
  }
});

/**
 * DELETE /connections/:userId - Remove friend
 */
router.delete('/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const success = await Connection.removeFriend(req.session.user.id, userId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Friend removed successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Friend connection not found' 
      });
    }

  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove friend' 
    });
  }
});

/**
 * POST /connections/block/:userId - Block user
 */
router.post('/block/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (userId == req.session.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot block yourself' 
      });
    }

    await Connection.blockUser(req.session.user.id, userId);

    res.json({ 
      success: true, 
      message: 'User blocked successfully' 
    });

  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to block user' 
    });
  }
});

/**
 * POST /connections/unblock/:userId - Unblock user
 */
router.post('/unblock/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const success = await Connection.unblockUser(req.session.user.id, userId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'User unblocked successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'User was not blocked' 
      });
    }

  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to unblock user' 
    });
  }
});

/**
 * GET /connections/blocked - Get blocked users
 */
router.get('/blocked', requireAuth, async (req, res) => {
  try {
    const blockedUsers = await Connection.getBlockedUsers(req.session.user.id);
    
    res.render('connections/blocked', {
      title: 'Blocked Users',
      blockedUsers,
      user: req.session.user
    });

  } catch (error) {
    console.error('Error getting blocked users:', error);
    res.render('error', {
      title: 'Error',
      message: 'Failed to load blocked users',
      user: req.session.user
    });
  }
});

/**
 * GET /connections/status/:userId - Get connection status with user
 */
router.get('/status/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const status = await Connection.getConnectionStatus(req.session.user.id, userId);
    
    res.json({ 
      success: true, 
      status 
    });

  } catch (error) {
    console.error('Error getting connection status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get connection status' 
    });
  }
});

/**
 * GET /connections/api/search - Search users (API)
 */
router.get('/api/search', requireAuth, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    // Get users - either search results or all users if no query
    const users = await Connection.searchUsers(q || '', req.session.user.id, parseInt(limit));
    
    res.json({ 
      success: true, 
      users,
      showingAll: !q || q.trim().length === 0
    });

  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to search users' 
    });
  }
});

/**
 * GET /connections/api/friends - Get friends list (API)
 */
router.get('/api/friends', requireAuth, async (req, res) => {
  try {
    const friends = await Connection.getFriends(req.session.user.id);
    
    res.json({ 
      success: true, 
      friends 
    });

  } catch (error) {
    console.error('Error getting friends:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get friends' 
    });
  }
});

/**
 * GET /connections/api/requests - Get pending requests (API)
 */
router.get('/api/requests', requireAuth, async (req, res) => {
  try {
    const pendingRequests = await Connection.getPendingRequests(req.session.user.id);
    const sentRequests = await Connection.getSentRequests(req.session.user.id);
    
    res.json({ 
      success: true, 
      pending: pendingRequests,
      sent: sentRequests
    });

  } catch (error) {
    console.error('Error getting friend requests:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get friend requests' 
    });
  }
});

module.exports = router;
