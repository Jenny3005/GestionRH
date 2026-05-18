from django.db import models

class Acteadministratif(models.Model):
    demande = models.ForeignKey('Demande', on_delete=models.CASCADE)
    type_acte = models.CharField(max_length=100)
    reference = models.CharField(max_length=100)
    date_generation = models.DateField()
    contenu = models.TextField()
    fichier_pdf = models.CharField(max_length=255)

    class Meta:
        db_table = 'acteadministratif'

    def __str__(self):
        return f"{self.type_acte} - {self.reference}"


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
    typecontrat = models.CharField(db_column='typeContrat', max_length=100)

    class Meta:
        db_table = 'agent'

    def __str__(self):
        return f"{self.nom} {self.prenom} - {self.matricule}"


class AgentRole(models.Model):
    role = models.ForeignKey('Role', on_delete=models.CASCADE)
    agent_id = models.IntegerField()

    class Meta:
        db_table = 'agent_role'


class Avancement(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE)
    date_prevue = models.DateField()
    date_effective = models.DateField()
    type_avancement = models.CharField(max_length=100)
    echelon_ancien = models.CharField(max_length=200)
    echelon_nouveau = models.CharField(max_length=200)
    piece_justificative = models.IntegerField()

    class Meta:
        db_table = 'avancement'

    def __str__(self):
        return f"{self.agent} - {self.type_avancement}"


class Candidature(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE)
    postevacant = models.ForeignKey('PosteVacant', on_delete=models.CASCADE)
    date_soumission = models.DateField()
    score_elligibilite = models.FloatField()
    statut = models.CharField(max_length=100)
    rang = models.CharField(max_length=255)

    class Meta:
        db_table = 'candidature'

    def __str__(self):
        return f"{self.agent} - {self.postevacant} - {self.statut}"


class Demande(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE)
    typedemande = models.ForeignKey('Typedemande', on_delete=models.CASCADE)
    statut = models.CharField(max_length=100)
    date_soumission = models.DateField()
    numero_suivi = models.CharField(max_length=255)

    class Meta:
        db_table = 'demande'

    def __str__(self):
        return f"{self.agent} - {self.typedemande} - {self.statut}"


class Demandeabsence(models.Model):
    demande = models.OneToOneField(Demande, on_delete=models.CASCADE, primary_key=True)
    date_debut = models.DateField()
    date_fin = models.DateField()
    nombrejours = models.IntegerField()
    motif = models.CharField(max_length=255)

    class Meta:
        db_table = 'demandeabsence'

    def __str__(self):
        return f"Absence du {self.date_debut} au {self.date_fin}"


class Demandeconge(models.Model):
    demande = models.OneToOneField(Demande, on_delete=models.CASCADE, primary_key=True)
    date_debut = models.DateField()
    date_fin = models.DateField()
    nombrejours = models.IntegerField()

    class Meta:
        db_table = 'demandeconge'

    def __str__(self):
        return f"Congé du {self.date_debut} au {self.date_fin}"


class Dossieragent(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE)
    date_creation = models.DateField()
    taux_completude = models.IntegerField(blank=True, null=True)

    class Meta:
        db_table = 'dossieragent'

    def __str__(self):
        return f"Dossier de {self.agent} - {self.taux_completude}%"


class Notification(models.Model):
    agent_id = models.IntegerField()
    message = models.CharField(max_length=255)
    type_notification = models.CharField(max_length=100)
    date_envoi = models.DateField()
    lue = models.IntegerField()

    class Meta:
        db_table = 'notification'

    def __str__(self):
        return f"{self.type_notification} - {self.message[:50]}"


class Permission(models.Model):
    code = models.CharField(max_length=100)
    libelle = models.CharField(max_length=100)
    description = models.CharField(max_length=255)

    class Meta:
        db_table = 'permission'

    def __str__(self):
        return self.libelle


class Piece(models.Model):
    dossieragent = models.ForeignKey(Dossieragent, on_delete=models.CASCADE)
    typepiece = models.ForeignKey('Typepiece', on_delete=models.CASCADE)
    nom_fichier = models.CharField(max_length=255)
    date_expiration = models.DateField()
    date_upload = models.DateField()
    valide = models.IntegerField()
    cheminfichier = models.CharField(max_length=255)

    class Meta:
        db_table = 'piece'

    def __str__(self):
        return self.nom_fichier


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
        db_table = 'poste_vacant'

    def __str__(self):
        return f"Poste {self.intitule} - {self.statut}"


class Role(models.Model):
    libelle = models.CharField(max_length=100)

    class Meta:
        db_table = 'role'

    def __str__(self):
        return self.libelle


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)

    class Meta:
        db_table = 'role_permission'
        unique_together = (('role', 'permission'),)


class Soldeconge(models.Model):
    annee = models.IntegerField()
    jours_acquis = models.IntegerField(blank=True, null=True)
    jours_pris = models.IntegerField(blank=True, null=True)
    jours_restants = models.IntegerField(blank=True, null=True)

    class Meta:
        db_table = 'soldeconge'

    def __str__(self):
        return f"Soldes {self.annee} - {self.jours_restants} jours"


class Typedemande(models.Model):
    libelle = models.CharField(max_length=200)
    duree_traitement_moyenne = models.IntegerField()
    acte_generable = models.IntegerField(blank=True, null=True)

    class Meta:
        db_table = 'typedemande'

    def __str__(self):
        return self.libelle


class Typepiece(models.Model):
    libelle = models.CharField(max_length=200)
    obligatoire = models.IntegerField(blank=True, null=True)
    duree_validite = models.CharField(max_length=100)

    class Meta:
        db_table = 'typepiece'

    def __str__(self):
        return self.libelle


class Validation(models.Model):
    demande = models.ForeignKey(Demande, on_delete=models.CASCADE)
    date_validation = models.DateField()
    decision = models.IntegerField()
    commentaire = models.TextField()

    class Meta:
        db_table = 'validation'

    def __str__(self):
        return f"Validation demande {self.demande} - Decision: {self.decision}"