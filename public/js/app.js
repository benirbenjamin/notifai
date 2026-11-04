/**
 * Managinga Space - Main JavaScript
 */

// Global App Object
window.ManagingaSpace = {
  // API Base URL
  apiBase: '/api',
  
  // Toast notifications
  showToast: function(message, type = 'success', duration = 5000) {
    const toastContainer = this.getOrCreateToastContainer();
    
    const toastId = 'toast-' + Date.now();
    const toastHTML = `
      <div class="toast align-items-center text-white bg-${type} border-0" role="alert" id="${toastId}">
        <div class="d-flex">
          <div class="toast-body">
            ${message}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: duration });
    toast.show();
    
    // Remove toast element after it's hidden
    toastElement.addEventListener('hidden.bs.toast', () => {
      toastElement.remove();
    });
  },
  
  // Get or create toast container
  getOrCreateToastContainer: function() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container position-fixed top-0 end-0 p-3';
      container.style.zIndex = '1055';
      document.body.appendChild(container);
    }
    return container;
  },
  
  // Loading states
  showLoading: function() {
    document.getElementById('loadingSpinner')?.classList.remove('d-none');
  },
  
  hideLoading: function() {
    document.getElementById('loadingSpinner')?.classList.add('d-none');
  },
  
  // Network status
  updateNetworkStatus: function() {
    const offlineBanner = document.getElementById('offlineBanner');
    if (navigator.onLine) {
      offlineBanner?.classList.add('d-none');
    } else {
      offlineBanner?.classList.remove('d-none');
    }
  },
  
  // API Helper
  api: {
    async request(endpoint, options = {}) {
      const url = `${window.ManagingaSpace.apiBase}${endpoint}`;
      const defaultOptions = {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      };
      
      const config = { ...defaultOptions, ...options };
      
      try {
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.message || 'Request failed');
        }
        
        return data;
      } catch (error) {
        console.error('API Request Error:', error);
        throw error;
      }
    },
    
    async get(endpoint) {
      return this.request(endpoint, { method: 'GET' });
    },
    
    async post(endpoint, data) {
      return this.request(endpoint, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    
    async put(endpoint, data) {
      return this.request(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    
    async delete(endpoint) {
      return this.request(endpoint, { method: 'DELETE' });
    }
  },
  
  // Activity Management
  activities: {
    async toggleCompletion(activityId, element) {
      try {
        window.ManagingaSpace.showLoading();
        
        const response = await fetch(`/activities/${activityId}/toggle`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin'
        });
        
        const result = await response.json();
        
        if (result.success) {
          // Update UI
          if (element) {
            const card = element.closest('.activity-card, .card');
            if (result.completed) {
              card?.classList.add('completed');
              element.innerHTML = '<i class="bi bi-check-circle-fill"></i> Completed';
              element.classList.remove('btn-outline-success');
              element.classList.add('btn-success');
            } else {
              card?.classList.remove('completed');
              element.innerHTML = '<i class="bi bi-circle"></i> Mark Complete';
              element.classList.remove('btn-success');
              element.classList.add('btn-outline-success');
            }
          }
          
          window.ManagingaSpace.showToast(
            result.completed ? 'Activity marked as completed!' : 'Activity marked as incomplete!',
            'success'
          );
        } else {
          window.ManagingaSpace.showToast(result.message || 'Failed to update activity', 'danger');
        }
      } catch (error) {
        console.error('Toggle completion error:', error);
        window.ManagingaSpace.showToast('An error occurred', 'danger');
      } finally {
        window.ManagingaSpace.hideLoading();
      }
    },
    
    async delete(activityId, element) {
      if (!confirm('Are you sure you want to delete this activity? This action cannot be undone.')) {
        return;
      }
      
      try {
        window.ManagingaSpace.showLoading();
        
        const response = await fetch(`/activities/${activityId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin'
        });
        
        const result = await response.json();
        
        if (result.success) {
          // Remove from UI
          const card = element.closest('.activity-card, .card, .list-group-item');
          if (card) {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'translateX(-100%)';
            setTimeout(() => card.remove(), 300);
          }
          
          window.ManagingaSpace.showToast('Activity deleted successfully!', 'success');
        } else {
          window.ManagingaSpace.showToast(result.message || 'Failed to delete activity', 'danger');
        }
      } catch (error) {
        console.error('Delete activity error:', error);
        window.ManagingaSpace.showToast('An error occurred', 'danger');
      } finally {
        window.ManagingaSpace.hideLoading();
      }
    },
    
    async updateProgress(activityId, progress) {
      try {
        const response = await window.ManagingaSpace.api.put(`/activities/${activityId}/progress`, {
          progress: parseInt(progress)
        });
        
        window.ManagingaSpace.showToast('Progress updated successfully!', 'success');
        return response;
      } catch (error) {
        window.ManagingaSpace.showToast('Failed to update progress', 'danger');
        throw error;
      }
    }
  },
  
  // Payment Management
  payments: {
    async addPayment(activityId, amount, notes = '') {
      try {
        const response = await fetch(`/activities/${activityId}/payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({ amount, notes })
        });
        
        const result = await response.json();
        
        if (result.success) {
          window.ManagingaSpace.showToast('Payment added successfully!', 'success');
          // Refresh page to update payment info
          setTimeout(() => window.location.reload(), 1000);
        } else {
          window.ManagingaSpace.showToast(result.message || 'Failed to add payment', 'danger');
        }
        
        return result;
      } catch (error) {
        console.error('Add payment error:', error);
        window.ManagingaSpace.showToast('An error occurred', 'danger');
        throw error;
      }
    }
  },
  
  // Subtask Management
  subtasks: {
    async add(activityId, title) {
      try {
        const response = await fetch(`/activities/${activityId}/subtask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({ title })
        });
        
        const result = await response.json();
        
        if (result.success) {
          window.ManagingaSpace.showToast('Subtask added successfully!', 'success');
          // Refresh page to show new subtask
          setTimeout(() => window.location.reload(), 1000);
        } else {
          window.ManagingaSpace.showToast(result.message || 'Failed to add subtask', 'danger');
        }
        
        return result;
      } catch (error) {
        console.error('Add subtask error:', error);
        window.ManagingaSpace.showToast('An error occurred', 'danger');
        throw error;
      }
    },
    
    async toggle(activityId, subtaskId) {
      try {
        const response = await fetch(`/activities/${activityId}/subtask/${subtaskId}/toggle`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin'
        });
        
        const result = await response.json();
        
        if (result.success) {
          // Refresh page to update progress
          setTimeout(() => window.location.reload(), 500);
        } else {
          window.ManagingaSpace.showToast(result.message || 'Failed to update subtask', 'danger');
        }
        
        return result;
      } catch (error) {
        console.error('Toggle subtask error:', error);
        window.ManagingaSpace.showToast('An error occurred', 'danger');
        throw error;
      }
    }
  },
  
  // Utility Functions
  utils: {
    formatCurrency(amount) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
    },
    
    formatDate(date) {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(new Date(date));
    },
    
    formatDateTime(date) {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(date));
    },
    
    isOverdue(dueDate) {
      return new Date(dueDate) < new Date();
    },
    
    getDaysUntilDue(dueDate) {
      const now = new Date();
      const due = new Date(dueDate);
      const diffTime = due - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    }
  }
};

// Alias for easier access
window.MS = window.ManagingaSpace;

// Global function for toast notifications
window.showToast = window.ManagingaSpace.showToast.bind(window.ManagingaSpace);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Update network status
  window.ManagingaSpace.updateNetworkStatus();
  
  // Listen for network changes
  window.addEventListener('online', window.ManagingaSpace.updateNetworkStatus);
  window.addEventListener('offline', window.ManagingaSpace.updateNetworkStatus);
  
  // Auto-hide alerts after 5 seconds
  document.querySelectorAll('.alert:not(.alert-permanent)').forEach(alert => {
    setTimeout(() => {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  });
  
  // Initialize tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
  
  // Initialize popovers
  const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
  popoverTriggerList.map(function (popoverTriggerEl) {
    return new bootstrap.Popover(popoverTriggerEl);
  });
  
  // Handle form submissions with loading states
  document.querySelectorAll('form[data-loading]').forEach(form => {
    form.addEventListener('submit', function() {
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
        
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }, 3000);
      }
    });
  });
  
  // Progress range inputs
  document.querySelectorAll('input[type="range"].progress-range').forEach(range => {
    const output = range.nextElementSibling;
    if (output && output.classList.contains('progress-output')) {
      range.addEventListener('input', function() {
        output.textContent = this.value + '%';
      });
    }
  });
  
  // Auto-save forms
  document.querySelectorAll('form[data-autosave]').forEach(form => {
    const inputs = form.querySelectorAll('input, select, textarea');
    let saveTimeout;
    
    inputs.forEach(input => {
      input.addEventListener('input', function() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          // Auto-save logic here
          console.log('Auto-saving form...');
        }, 2000);
      });
    });
  });
  
  // Character counters
  document.querySelectorAll('textarea[data-max-length]').forEach(textarea => {
    const maxLength = parseInt(textarea.dataset.maxLength);
    const counter = document.createElement('small');
    counter.className = 'text-muted mt-1 d-block';
    textarea.parentNode.appendChild(counter);
    
    function updateCounter() {
      const remaining = maxLength - textarea.value.length;
      counter.textContent = `${remaining} characters remaining`;
      
      if (remaining < 0) {
        counter.classList.add('text-danger');
        counter.classList.remove('text-muted');
      } else {
        counter.classList.add('text-muted');
        counter.classList.remove('text-danger');
      }
    }
    
    textarea.addEventListener('input', updateCounter);
    updateCounter();
  });
  
  // Mobile responsive enhancements
  initializeMobileFeatures();
});

// Mobile-specific features
function initializeMobileFeatures() {
  // Bottom navigation active state
  updateBottomNavActiveState();
  
  // Mobile viewport height fix for bottom navigation
  setMobileViewportHeight();
  
  // Handle window resize for mobile optimizations
  window.addEventListener('resize', () => {
    setMobileViewportHeight();
  });
  
  // Prevent zoom on input focus (iOS)
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="number"], textarea, select').forEach(input => {
      input.addEventListener('focus', function() {
        this.style.fontSize = '16px';
      });
      input.addEventListener('blur', function() {
        this.style.fontSize = '';
      });
    });
  }
}

// Update bottom navigation active state
function updateBottomNavActiveState() {
  const path = window.location.pathname;
  const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
  
  bottomNavItems.forEach(item => {
    item.classList.remove('active');
    const href = item.getAttribute('href');
    
    if (href === path || (href !== '/dashboard' && path.startsWith(href))) {
      item.classList.add('active');
    }
  });
}

// Set proper mobile viewport height
function setMobileViewportHeight() {
  // First we get the viewport height and multiply it by 1% to get a value for a vh unit
  const vh = window.innerHeight * 0.01;
  // Then we set the value in the --vh custom property to the root of the document
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Add mobile-specific CSS variable
if (window.CSS && window.CSS.supports && window.CSS.supports('height', '100dvh')) {
  document.documentElement.style.setProperty('--mobile-vh', '100dvh');
} else {
  document.documentElement.style.setProperty('--mobile-vh', '100vh');
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Ctrl/Cmd + K for search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const searchInput = document.getElementById('navbarSearch');
    if (searchInput) {
      searchInput.focus();
    }
  }
  
  // Ctrl/Cmd + N for new activity
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    const quickAddModal = document.getElementById('quickAddModal');
    if (quickAddModal) {
      const modal = new bootstrap.Modal(quickAddModal);
      modal.show();
    }
  }
  
  // Escape to close modals and clear search
  if (e.key === 'Escape') {
    const searchResults = document.getElementById('searchResults');
    if (searchResults && !searchResults.classList.contains('d-none')) {
      searchResults.classList.add('d-none');
      const searchInput = document.getElementById('navbarSearch');
      if (searchInput) {
        searchInput.blur();
      }
    }
  }
});

// Service Worker registration (handled in layout.ejs)
// but we can add SW message handling here
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'CACHE_UPDATED') {
      showToast('App updated! Refresh to see the latest version.', 'info', 10000);
    }
  });
}

// ================================
// COLLABORATION FEATURES
// ================================

// Collaboration management
window.ManagingaSpace.collaboration = {
  // Invite collaborator to activity
  async inviteCollaborator(activityId, email, role = 'editor') {
    try {
      const response = await window.ManagingaSpace.api.post(`/collaboration/${activityId}/invite`, {
        email: email,
        role: role
      });
      
      window.ManagingaSpace.showToast(response.message, 'success');
      return response;
    } catch (error) {
      console.error('Error inviting collaborator:', error);
      window.ManagingaSpace.showToast(error.message || 'Failed to invite collaborator', 'danger');
      throw error;
    }
  },
  
  // Remove collaborator from activity
  async removeCollaborator(activityId, collaboratorId) {
    try {
      const response = await window.ManagingaSpace.api.delete(`/collaboration/${activityId}/${collaboratorId}`);
      
      window.ManagingaSpace.showToast(response.message, 'success');
      return response;
    } catch (error) {
      console.error('Error removing collaborator:', error);
      window.ManagingaSpace.showToast(error.message || 'Failed to remove collaborator', 'danger');
      throw error;
    }
  }
};

// Real-time notifications (simple polling for now)
window.ManagingaSpace.notifications = {
  pollInterval: null,
  
  // Start polling for notifications
  startPolling: function() {
    this.pollInterval = setInterval(() => {
      this.checkNotifications();
    }, 30000); // Check every 30 seconds
  },
  
  // Check for new notifications
  async checkNotifications() {
    try {
      console.log('🔔 Checking for notifications...');
      
      // Check for unread general notifications
      const notificationsResponse = await fetch('/notifications/unread', {
        credentials: 'same-origin'
      });
      
      console.log('📱 Notifications response status:', notificationsResponse.status);
      
      if (notificationsResponse.ok) {
        const data = await notificationsResponse.json();
        console.log('📱 Notifications data:', data);
        console.log('📱 Notification count:', data.notifications?.length || 0);
        
        this.updateNotificationBadge(data.notifications?.length || 0);
        this.updateNotificationList(data.notifications || []);
      } else {
        console.error('❌ Failed to fetch notifications:', notificationsResponse.status);
      }
      
    } catch (error) {
      console.error('❌ Error checking notifications:', error);
    }
  },
  
  // Update notification badge
  updateNotificationBadge: function(count) {
    console.log('🔔 Updating notification badge with count:', count);
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('d-none');
        console.log('✅ Notification badge shown with count:', count);
      } else {
        badge.classList.add('d-none');
        console.log('🔕 Notification badge hidden');
      }
    } else {
      console.error('❌ Notification badge element not found');
    }
  },

  // Update notification list in dropdown
  updateNotificationList: function(notifications) {
    console.log('📱 Updating notification list with:', notifications.length, 'notifications');
    const list = document.getElementById('notificationList');
    if (!list) {
      console.error('❌ Notification list element not found');
      return;
    }

    if (notifications.length === 0) {
      list.innerHTML = '<li><span class="dropdown-item-text text-muted">No new notifications</span></li>';
      console.log('📭 No notifications to display');
      return;
    }

    console.log('📬 Displaying notifications:', notifications);

    const notificationItems = notifications.slice(0, 5).map(notification => {
      const timeAgo = this.formatTimeAgo(new Date(notification.created_at));
      const typeIcon = this.getNotificationIcon(notification.type);
      
      return `
        <li>
          <a class="dropdown-item notification-item ${notification.is_read ? '' : 'unread'}" 
             href="#" 
             onclick="markNotificationAsRead(${notification.id}, '${this.getNotificationUrl(notification)}')">
            <div class="d-flex align-items-start">
              <div class="notification-icon me-2">
                <i class="bi ${typeIcon}"></i>
              </div>
              <div class="flex-grow-1">
                <div class="notification-title fw-semibold">${notification.title}</div>
                <div class="notification-message text-muted small">${notification.message}</div>
                <div class="notification-time text-muted small">${timeAgo}</div>
              </div>
            </div>
          </a>
        </li>
      `;
    }).join('');

    list.innerHTML = notificationItems;
  },

  // Get notification icon based on type
  getNotificationIcon: function(type) {
    const iconMap = {
      'activity_created': 'bi-plus-circle text-success',
      'activity_completed': 'bi-check-circle text-success',
      'activity_due': 'bi-clock text-warning',
      'activity_overdue': 'bi-exclamation-triangle text-danger',
      'activity_deleted': 'bi-trash text-danger',
      'activity_updated': 'bi-pencil text-info',
      'payment_success': 'bi-credit-card text-success',
      'payment_failed': 'bi-credit-card text-danger',
      'test': 'bi-bell text-info'
    };
    return iconMap[type] || 'bi-bell text-info';
  },

  // Get notification URL based on type and data
  getNotificationUrl: function(notification) {
    const data = typeof notification.data === 'string' ? JSON.parse(notification.data) : notification.data;
    
    switch (notification.type) {
      case 'activity_created':
      case 'activity_due':
      case 'activity_overdue':
      case 'activity_updated':
        return data.activityId ? `/activities/${data.activityId}` : '/activities';
      case 'activity_completed':
      case 'activity_deleted':
        return '/activities';
      case 'payment_success':
      case 'payment_failed':
        return '/payments';
      default:
        return '/dashboard';
    }
  },

  // Format time ago helper
  formatTimeAgo: function(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }
};

// Initialize notifications polling when user is logged in
document.addEventListener('DOMContentLoaded', function() {
  if (window.location.pathname !== '/' && window.location.pathname !== '/auth/login') {
    console.log('🔔 Starting notification polling...');
    window.ManagingaSpace.notifications.startPolling();
    // Also check immediately
    window.ManagingaSpace.notifications.checkNotifications();
  }
});

// Debug function to manually check notifications
window.debugNotifications = function() {
  console.log('🔍 Manual notification check...');
  window.ManagingaSpace.notifications.checkNotifications();
};

// Global function to mark notification as read
window.markNotificationAsRead = async function(notificationId, url) {
  try {
    const response = await fetch(`/notifications/${notificationId}/read`, {
      method: 'POST',
      credentials: 'same-origin'
    });
    
    if (response.ok) {
      // Refresh notification count
      window.ManagingaSpace.notifications.checkNotifications();
      
      // Navigate to URL if provided
      if (url && url !== '#') {
        window.location.href = url;
      }
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
    // Still navigate even if marking as read fails
    if (url && url !== '#') {
      window.location.href = url;
    }
  }
};

// Cleanup when page unloads
window.addEventListener('beforeunload', function() {
  if (window.ManagingaSpace.notifications.pollInterval) {
    clearInterval(window.ManagingaSpace.notifications.pollInterval);
  }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.ManagingaSpace;
}
