# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class ActeAdministratif(models.Model):
    demande = models.OneToOneField('Demande', models.DO_NOTHING, blank=True, null=True)
    reference = models.CharField(primary_key=True, max_length=100)
    type_acte = models.CharField(max_length=100)
    statut = models.CharField(max_length=50)
    date_generation = models.DateField()
    contenu = models.TextField(blank=True, null=True)
    fichier_pdf = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'acte_administratif'


class Agent(models.Model):
    matricule = models.CharField(primary_key=True, max_length=50)
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    email = models.CharField(unique=True, max_length=150)
    date_naissance = models.DateField(blank=True, null=True)
    telephone = models.CharField(max_length=20, blank=True, null=True)
    date_prise_service = models.DateField()
    adresse = models.CharField(max_length=255, blank=True, null=True)
    poste = models.CharField(max_length=100, blank=True, null=True)
    direction = models.CharField(max_length=100, blank=True, null=True)
    typecontrat = models.CharField(db_column='typeContrat', max_length=50, blank=True, null=True)  # Field name made lowercase.
    corps = models.CharField(max_length=100, blank=True, null=True)
    echelon = models.CharField(max_length=20, blank=True, null=True)
    actif = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'agent'


class AgentRole(models.Model):
    agent = models.OneToOneField(Agent, models.DO_NOTHING, primary_key=True)  # The composite primary key (agent_id, role_id) found, that is not supported. The first column is selected.
    role = models.ForeignKey('Role', models.DO_NOTHING)
    date_attribution = models.DateField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'agent_role'
        unique_together = (('agent', 'role'),)


class Avancement(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    date_prevue = models.DateField()
    date_effective = models.DateField(blank=True, null=True)
    type_avancement = models.CharField(max_length=50)
    echelon_ancien = models.CharField(max_length=20, blank=True, null=True)
    echelon_nouveau = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'avancement'


class Candidature(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    poste_vacant = models.ForeignKey('PosteVacant', models.DO_NOTHING)
    date_soumission = models.DateField()
    score_eligibilite = models.FloatField(blank=True, null=True)
    statut = models.CharField(max_length=50)
    rang = models.CharField(max_length=10, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'candidature'
        unique_together = (('agent', 'poste_vacant'),)


class Compte(models.Model):
    agent = models.OneToOneField(Agent, models.DO_NOTHING)
    login = models.CharField(unique=True, max_length=100)
    mot_de_passe = models.CharField(max_length=255)
    dateactivation = models.DateField(db_column='dateActivation', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'compte'


class Demande(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    type_demande = models.ForeignKey('TypeDemande', models.DO_NOTHING)
    statut = models.CharField(max_length=50)
    date_soumission = models.DateField()
    numerosuivi = models.CharField(db_column='numeroSuivi', unique=True, max_length=50)  # Field name made lowercase.
    jours_consommes = models.IntegerField(blank=True, null=True, default=0)
    jours_restants = models.IntegerField(blank=True, null=True, default=0)
    annee = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'demande'


class DemandeAbsence(models.Model):
    demande = models.OneToOneField(Demande, models.DO_NOTHING, db_column='id', primary_key=True)
    date_debut = models.DateField(db_column='dateDebut')
    date_fin = models.DateField(db_column='dateFin')
    nombrejours = models.IntegerField(db_column='nombreJours')
    motif = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'demande_absence'


class DemandeConge(models.Model):
    demande = models.OneToOneField(Demande, models.DO_NOTHING, db_column='id', primary_key=True)
    date_debut = models.DateField(db_column='dateDebut')
    date_fin = models.DateField(db_column='dateFin')
    nombrejours = models.IntegerField(db_column='nombreJours')

    class Meta:
        managed = False
        db_table = 'demande_conge'


class DossierAgent(models.Model):
    agent = models.OneToOneField(Agent, models.DO_NOTHING)
    datecreation = models.DateField(db_column='dateCreation')  # Field name made lowercase.
    taux_completude = models.FloatField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'dossier_agent'


class Notification(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    message = models.TextField()
    type_notification = models.CharField(max_length=12)
    date_envoi = models.DateField()
    lue = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'notification'


class Permission(models.Model):
    code = models.CharField(unique=True, max_length=20)
    description = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'permission'


class Piece(models.Model):
    dossier_agent = models.ForeignKey(DossierAgent, models.DO_NOTHING)
    type_piece = models.ForeignKey('TypePiece', models.DO_NOTHING)
    nom_fichier = models.CharField(max_length=255)
    date_expiration = models.DateField(blank=True, null=True)
    date_upload = models.DateField()
    valide = models.IntegerField(blank=True, null=True)
    cheminfichier=models.TextField()

    class Meta:
        managed = False
        db_table = 'piece'


class PosteVacant(models.Model):
    intitule = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    profil_recherche = models.CharField(max_length=255, blank=True, null=True)
    date_publication = models.DateField()
    date_cloture = models.DateField(blank=True, null=True)
    statut = models.CharField(max_length=50)
    directiondemande = models.CharField(db_column='directionDemande', max_length=100, blank=True, null=True)  # Field name made lowercase.
    diplomerequis = models.CharField(db_column='diplomeRequis', max_length=100, blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'poste_vacant'


class Role(models.Model):
    libelle = models.CharField(unique=True, max_length=100)

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


class SoldeConge(models.Model):
    agent = models.ForeignKey(Agent, models.DO_NOTHING)
    annee = models.IntegerField()
    jours_acquis = models.IntegerField(blank=True, null=True)
    jours_pris = models.IntegerField(blank=True, null=True)
    jours_restants = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'solde_conge'
        unique_together = (('agent', 'annee'),)


class TypeDemande(models.Model):
    libelle = models.CharField(max_length=100)
    duree_traitement_moyenne = models.CharField(max_length=50, blank=True, null=True)
    acte_generable = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'type_demande'


class TypePiece(models.Model):
    libelle = models.CharField(max_length=100)
    obligatoire = models.IntegerField(blank=True, null=True)
    duree_validite = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'type_piece'


class Validation(models.Model):
    demande = models.OneToOneField(Demande, models.DO_NOTHING)
    datevalidation = models.DateField(db_column='dateValidation', blank=True, null=True)  # Field name made lowercase.
    decision = models.IntegerField(blank=True, null=True)
    commentaire = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'validation'
