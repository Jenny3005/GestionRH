# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class Acteadministratif(models.Model):
    demande = models.ForeignKey('Demande', models.DO_NOTHING)
    type_acte = models.CharField(max_length=100)
    reference = models.CharField(max_length=100)
    date_generation = models.DateField()
    contenu = models.TextField()
    fichier_pdf = models.CharField(max_length=255)

    class Meta:
        managed = False
        db_table = 'acteadministratif'


class Agent(models.Model):
    matricule = models.CharField(max_length=50)
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    email = models.CharField(unique=True, max_length=100)
    mot_de_passe = models.CharField(max_length=255)
    telephone = models.CharField(max_length=50)
    date_prise_service = models.DateField()
    adresse = models.CharField(max_length=255)
    actif = models.IntegerField()
    poste = models.CharField(max_length=255)
    direction = models.CharField(max_length=255)
    typecontrat = models.CharField(db_column='typeContrat', max_length=100)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'agent'


class AgentRole(models.Model):
    role = models.ForeignKey('Role', models.DO_NOTHING)
    agent_id = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'agent_role'


class AuthGroup(models.Model):
    name = models.CharField(unique=True, max_length=150)

    class Meta:
        managed = False
        db_table = 'auth_group'


class AuthGroupPermissions(models.Model):
    group = models.ForeignKey(AuthGroup, models.DO_NOTHING)
    permission = models.ForeignKey('AuthPermission', models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'auth_group_permissions'
        unique_together = (('group', 'permission'),)


class AuthPermission(models.Model):
    name = models.CharField(max_length=255)
    content_type = models.ForeignKey('DjangoContentType', models.DO_NOTHING)
    codename = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'auth_permission'
        unique_together = (('content_type', 'codename'),)


class AuthUser(models.Model):
    password = models.CharField(max_length=128)
    last_login = models.DateTimeField(blank=True, null=True)
    is_superuser = models.IntegerField()
    username = models.CharField(unique=True, max_length=150)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.CharField(max_length=254)
    is_staff = models.IntegerField()
    is_active = models.IntegerField()
    date_joined = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'auth_user'


class AuthUserGroups(models.Model):
    user = models.ForeignKey(AuthUser, models.DO_NOTHING)
    group = models.ForeignKey(AuthGroup, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'auth_user_groups'
        unique_together = (('user', 'group'),)


class AuthUserUserPermissions(models.Model):
    user = models.ForeignKey(AuthUser, models.DO_NOTHING)
    permission = models.ForeignKey(AuthPermission, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'auth_user_user_permissions'
        unique_together = (('user', 'permission'),)


class Avancement(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    date_prevue = models.DateField()
    date_effective = models.DateField()
    type_avancement = models.CharField(max_length=100)
    echelon_ancien = models.CharField(max_length=200)
    echelon_nouveau = models.CharField(max_length=200)
    piece_justificative = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'avancement'


class Candidature(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    postevacant = models.ForeignKey('PosteVacant', models.DO_NOTHING)
    date_soumission = models.DateField()
    score_elligibilite = models.FloatField()
    statut = models.CharField(max_length=100)
    rang = models.CharField(max_length=255)

    class Meta:
        managed = False
        db_table = 'candidature'


class Demande(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    typedemande = models.ForeignKey('self', models.DO_NOTHING)
    statut = models.CharField(max_length=100)
    date_soumission = models.DateField()
    numero_suivi = models.CharField(max_length=255)

    class Meta:
        managed = False
        db_table = 'demande'


class Demandeabsence(models.Model):
    id = models.OneToOneField(Demande, models.DO_NOTHING, db_column='id', primary_key=True)
    date_debut = models.DateField()
    date_fin = models.DateField()
    nombrejours = models.IntegerField()
    motif = models.CharField(max_length=255)

    class Meta:
        managed = False
        db_table = 'demandeabsence'


class Demandeconge(models.Model):
    id = models.OneToOneField(Demande, models.DO_NOTHING, db_column='id', primary_key=True)
    date_debut = models.DateField()
    date_fin = models.DateField()
    nombrejours = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'demandeconge'


class DjangoAdminLog(models.Model):
    action_time = models.DateTimeField()
    object_id = models.TextField(blank=True, null=True)
    object_repr = models.CharField(max_length=200)
    action_flag = models.PositiveSmallIntegerField()
    change_message = models.TextField()
    content_type = models.ForeignKey('DjangoContentType', models.DO_NOTHING, blank=True, null=True)
    user = models.ForeignKey(AuthUser, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'django_admin_log'


class DjangoContentType(models.Model):
    app_label = models.CharField(max_length=100)
    model = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'django_content_type'
        unique_together = (('app_label', 'model'),)


class DjangoMigrations(models.Model):
    app = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    applied = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'django_migrations'


class DjangoSession(models.Model):
    session_key = models.CharField(primary_key=True, max_length=40)
    session_data = models.TextField()
    expire_date = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'django_session'


class Dossieragent(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    date_creation = models.DateField()
    taux_completude = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'dossieragent'


class Notification(models.Model):
    agent_id = models.IntegerField()
    message = models.CharField(max_length=255)
    type_notification = models.CharField(max_length=100)
    date_envoi = models.DateField()
    lue = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'notification'


class Permission(models.Model):
    code = models.CharField(max_length=100)
    libelle = models.CharField(max_length=100)
    description = models.CharField(max_length=255)

    class Meta:
        managed = False
        db_table = 'permission'


class Piece(models.Model):
    dossieragent = models.ForeignKey(Dossieragent, models.DO_NOTHING)
    typepiece = models.ForeignKey('Typepiece', models.DO_NOTHING)
    nom_fichier = models.CharField(max_length=255)
    date_expiration = models.DateField()
    date_upload = models.DateField()
    valide = models.IntegerField()
    cheminfichier = models.CharField(max_length=255)

    class Meta:
        managed = False
        db_table = 'piece'


class PosteVacant(models.Model):
    intitule = models.IntegerField()
    description = models.CharField(max_length=255)
    profil_recherche = models.IntegerField()
    date_publication = models.IntegerField()
    date_cloture = models.IntegerField()
    statut = models.IntegerField()
    direction_demande = models.IntegerField()
    diplome_requis = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'poste_vacant'


class Role(models.Model):
    libelle = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'role'


class RolePermission(models.Model):
    role = models.OneToOneField(Role, models.DO_NOTHING, primary_key=True)  # The composite primary key (role_id, permission_id) found, that is not supported. The first column is selected.
    permission = models.ForeignKey(Permission, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'role_permission'
        unique_together = (('role', 'permission'),)


class Soldeconge(models.Model):
    annee = models.IntegerField()
    jours_acquis = models.IntegerField(blank=True, null=True)
    jours_pris = models.IntegerField(blank=True, null=True)
    jours_restants = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'soldeconge'


class Typedemande(models.Model):
    libelle = models.CharField(max_length=200)
    duree_traitement_moyenne = models.IntegerField()
    acte_generable = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'typedemande'


class Typepiece(models.Model):
    libelle = models.CharField(max_length=200)
    obligatoire = models.IntegerField(blank=True, null=True)
    duree_validite = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'typepiece'


class Validation(models.Model):
    demande = models.ForeignKey(Demande, models.DO_NOTHING)
    date_validation = models.DateField()
    decision = models.IntegerField()
    commentaire = models.TextField()

    class Meta:
        managed = False
        db_table = 'validation'
