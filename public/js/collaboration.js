// Activity collaboration functionality
document.addEventListener('DOMContentLoaded', function() {
  // Initialize collaboration features on activity pages
  initializeCollaborationFeatures();
  
  // Handle collaborator invitation
  const inviteCollaboratorForm = document.getElementById('inviteCollaboratorForm');
  if (inviteCollaboratorForm) {
    inviteCollaboratorForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(this);
      const activityId = formData.get('activityId');
      const email = formData.get('email');
      const role = formData.get('role');
      
      try {
        await window.ManagingaSpace.collaboration.inviteCollaborator(activityId, email, role);
        
        // Close modal and refresh
        const modal = bootstrap.Modal.getInstance(document.getElementById('inviteCollaboratorModal'));
        if (modal) modal.hide();
        
        // Clear form
        this.reset();
        
        // Refresh collaborators list
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error) {
        console.error('Error inviting collaborator:', error);
      }
    });
  }
  
  // Handle collaborator removal
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('remove-collaborator-btn')) {
      const activityId = e.target.dataset.activityId;
      const collaboratorId = e.target.dataset.collaboratorId;
      const collaboratorName = e.target.dataset.collaboratorName;
      
      if (confirm(`Are you sure you want to remove ${collaboratorName} from this activity?`)) {
        removeCollaborator(activityId, collaboratorId);
      }
    }
  });
  
  // Handle task assignment to collaborators
  const assignTaskForms = document.querySelectorAll('.assign-task-form');
  assignTaskForms.forEach(form => {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(this);
      const taskId = formData.get('taskId');
      const assignedTo = formData.get('assignedTo');
      
      try {
        const response = await window.ManagingaSpace.api.post(`/activities/tasks/${taskId}/assign`, {
          assignedTo: assignedTo
        });
        
        window.ManagingaSpace.showToast(response.message, 'success');
        
        // Update task display
        updateTaskDisplay(taskId, assignedTo);
      } catch (error) {
        console.error('Error assigning task:', error);
        window.ManagingaSpace.showToast(error.message || 'Failed to assign task', 'danger');
      }
    });
  });
  
  // Handle task progress updates by collaborators
  const progressForms = document.querySelectorAll('.task-progress-form');
  progressForms.forEach(form => {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(this);
      const taskId = formData.get('taskId');
      const progress = formData.get('progress');
      const comment = formData.get('comment');
      
      try {
        const response = await window.ManagingaSpace.api.post(`/activities/tasks/${taskId}/progress`, {
          progress: progress,
          comment: comment
        });
        
        window.ManagingaSpace.showToast(response.message, 'success');
        
        // Update progress display
        updateProgressDisplay(taskId, progress);
        
        // Close modal if open
        const modal = this.closest('.modal');
        if (modal) {
          const modalInstance = bootstrap.Modal.getInstance(modal);
          if (modalInstance) modalInstance.hide();
        }
      } catch (error) {
        console.error('Error updating progress:', error);
        window.ManagingaSpace.showToast(error.message || 'Failed to update progress', 'danger');
      }
    });
  });
});

// Initialize collaboration features
function initializeCollaborationFeatures() {
  // Add collaboration button to activity cards
  const activityCards = document.querySelectorAll('.activity-card');
  activityCards.forEach(card => {
    const activityId = card.dataset.activityId;
    if (activityId) {
      addCollaborationButton(card, activityId);
    }
  });
  
  // Initialize collaborator avatars with tooltips
  const collaboratorAvatars = document.querySelectorAll('.collaborator-avatar');
  collaboratorAvatars.forEach(avatar => {
    if (window.bootstrap && window.bootstrap.Tooltip) {
      new bootstrap.Tooltip(avatar);
    }
  });
  
  // Initialize role badges
  updateRoleBadges();
}

// Add collaboration button to activity card
function addCollaborationButton(card, activityId) {
  const actionsContainer = card.querySelector('.activity-actions');
  if (actionsContainer && !actionsContainer.querySelector('.collaboration-btn')) {
    const collaborationBtn = document.createElement('button');
    collaborationBtn.className = 'btn btn-sm btn-outline-primary collaboration-btn';
    collaborationBtn.innerHTML = '<i class="fas fa-users"></i> Collaborate';
    collaborationBtn.onclick = () => showCollaborationModal(activityId);
    
    actionsContainer.appendChild(collaborationBtn);
  }
}

// Show collaboration modal
function showCollaborationModal(activityId) {
  const modal = document.getElementById('collaborationModal');
  if (modal) {
    document.getElementById('collaborationActivityId').value = activityId;
    
    // Load current collaborators
    loadCollaborators(activityId);
    
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
  }
}

// Load collaborators for activity
async function loadCollaborators(activityId) {
  try {
    const response = await window.ManagingaSpace.api.get(`/collaboration/${activityId}/collaborators`);
    displayCollaborators(response.collaborators);
  } catch (error) {
    console.error('Error loading collaborators:', error);
  }
}

// Display collaborators list
function displayCollaborators(collaborators) {
  const container = document.getElementById('collaboratorsList');
  if (!container) return;
  
  if (collaborators.length === 0) {
    container.innerHTML = '<p class="text-muted">No collaborators yet. Invite someone to get started!</p>';
    return;
  }
  
  const collaboratorsHtml = collaborators.map(collaborator => `
    <div class="collaborator-item d-flex align-items-center justify-content-between p-2 border-bottom">
      <div class="d-flex align-items-center">
        <div class="avatar-sm me-2">
          <div class="avatar-circle bg-primary">
            ${collaborator.first_name.charAt(0)}${collaborator.last_name.charAt(0)}
          </div>
        </div>
        <div>
          <div class="fw-medium">${collaborator.first_name} ${collaborator.last_name}</div>
          <small class="text-muted">${collaborator.email}</small>
          <div class="badge bg-${getRoleBadgeColor(collaborator.role)} mt-1">${collaborator.role}</div>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-sm btn-outline-primary" onclick="changeCollaboratorRole('${collaborator.id}', '${collaborator.role}')">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger remove-collaborator-btn" 
                data-activity-id="${collaborator.activity_id}" 
                data-collaborator-id="${collaborator.id}"
                data-collaborator-name="${collaborator.first_name} ${collaborator.last_name}">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = collaboratorsHtml;
}

// Get role badge color
function getRoleBadgeColor(role) {
  switch (role) {
    case 'manager': return 'danger';
    case 'editor': return 'warning';
    case 'viewer': return 'info';
    default: return 'secondary';
  }
}

// Change collaborator role
function changeCollaboratorRole(collaboratorId, currentRole) {
  const roles = ['viewer', 'editor', 'manager'];
  const currentIndex = roles.indexOf(currentRole);
  const newRole = roles[(currentIndex + 1) % roles.length];
  
  // Implementation would depend on backend API
  console.log(`Changing collaborator ${collaboratorId} role from ${currentRole} to ${newRole}`);
}

// Remove collaborator
async function removeCollaborator(activityId, collaboratorId) {
  try {
    await window.ManagingaSpace.collaboration.removeCollaborator(activityId, collaboratorId);
    
    // Refresh collaborators list
    loadCollaborators(activityId);
  } catch (error) {
    console.error('Error removing collaborator:', error);
  }
}

// Update task display with assignee
function updateTaskDisplay(taskId, assignedTo) {
  const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
  if (taskElement) {
    const assigneeElement = taskElement.querySelector('.task-assignee');
    if (assigneeElement) {
      // Update assignee display
      if (assignedTo) {
        assigneeElement.innerHTML = `<i class="fas fa-user"></i> Assigned`;
        assigneeElement.className = 'task-assignee badge bg-primary';
      } else {
        assigneeElement.innerHTML = `<i class="fas fa-user-slash"></i> Unassigned`;
        assigneeElement.className = 'task-assignee badge bg-secondary';
      }
    }
  }
}

// Update progress display
function updateProgressDisplay(taskId, progress) {
  const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
  if (taskElement) {
    const progressBar = taskElement.querySelector('.progress-bar');
    const progressText = taskElement.querySelector('.progress-text');
    
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
      progressBar.setAttribute('aria-valuenow', progress);
    }
    
    if (progressText) {
      progressText.textContent = `${progress}%`;
    }
    
    // Update progress color based on value
    if (progressBar) {
      progressBar.className = 'progress-bar';
      if (progress >= 100) {
        progressBar.classList.add('bg-success');
      } else if (progress >= 75) {
        progressBar.classList.add('bg-info');
      } else if (progress >= 50) {
        progressBar.classList.add('bg-warning');
      } else {
        progressBar.classList.add('bg-primary');
      }
    }
  }
}

// Update role badges
function updateRoleBadges() {
  const roleBadges = document.querySelectorAll('.role-badge');
  roleBadges.forEach(badge => {
    const role = badge.textContent.toLowerCase();
    badge.className = `role-badge badge bg-${getRoleBadgeColor(role)}`;
  });
}

// Export functions for HTML usage
window.showCollaborationModal = showCollaborationModal;
window.changeCollaboratorRole = changeCollaboratorRole;
