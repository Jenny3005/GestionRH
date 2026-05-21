from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('send-otp/', views.send_otp, name='send_otp'),
    path('verify-otp/', views.verify_otp, name='verify_otp'),
    path('activate/', views.activate_account, name='activate_account'),
    path('agents/', views.get_all_agents, name='get_all_agents'),
    path('stats/', views.get_stats, name='get_stats'),
    path('roles/', views.get_all_roles, name='get_all_roles'),
    path('roles/add/', views.add_role, name='add_role'),
    path('roles/<int:role_id>/delete/', views.delete_role, name='delete_role'),
    path('agents/<int:agent_id>/role/', views.update_agent_role, name='update_agent_role'),
    path('import-agents/', views.import_agents, name='import_agents'),
    path('agent/<str:matricule>/', views.get_agent_by_matricule, name='get_agent'),
]