from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, default_permissions
from .presence import is_online


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    permissions = serializers.JSONField(required=False)
    is_driver = serializers.BooleanField(required=False)
    can_override_stock = serializers.BooleanField(required=False)
    can_approve_payments = serializers.BooleanField(required=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'is_active', 'is_superuser', 'password', 'permissions', 'is_driver',
                  'can_override_stock', 'can_approve_payments', 'date_joined']
        read_only_fields = ['date_joined', 'is_superuser']

    PROFILE_FLAGS = ('is_driver', 'can_override_stock', 'can_approve_payments')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        profile = getattr(instance, 'profile', None)
        data['permissions'] = profile.permissions if profile else default_permissions()
        for flag in self.PROFILE_FLAGS:
            data[flag] = getattr(profile, flag) if profile else False
        # Monitor de conectados (la lista de usuarios es solo para administradores)
        last_seen = profile.last_seen if profile else None
        data['last_seen'] = last_seen
        data['last_login'] = instance.last_login
        data['online'] = is_online(last_seen)
        return data

    def _save_profile(self, user, permissions, flags):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if permissions is not None:
            profile.permissions = permissions
        for flag, value in flags.items():
            if value is not None:
                setattr(profile, flag, value)
        profile.save()

    def _pop_profile_data(self, validated_data):
        permissions = validated_data.pop('permissions', None)
        flags = {flag: validated_data.pop(flag, None) for flag in self.PROFILE_FLAGS}
        return permissions, flags

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        permissions, flags = self._pop_profile_data(validated_data)
        user = User(**validated_data)
        user.set_password(password or User.objects.make_random_password())
        user.save()
        self._save_profile(user, permissions, flags)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        permissions, flags = self._pop_profile_data(validated_data)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        self._save_profile(instance, permissions, flags)
        return instance
