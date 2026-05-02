from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, default_permissions


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    permissions = serializers.JSONField(required=False)
    is_driver = serializers.BooleanField(required=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'is_active', 'is_superuser', 'password', 'permissions', 'is_driver', 'date_joined']
        read_only_fields = ['date_joined', 'is_superuser']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        profile = getattr(instance, 'profile', None)
        data['permissions'] = profile.permissions if profile else default_permissions()
        data['is_driver'] = profile.is_driver if profile else False
        return data

    def _save_profile(self, user, permissions, is_driver):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if permissions is not None:
            profile.permissions = permissions
        if is_driver is not None:
            profile.is_driver = is_driver
        profile.save()

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        permissions = validated_data.pop('permissions', None)
        is_driver = validated_data.pop('is_driver', None)
        user = User(**validated_data)
        user.set_password(password or User.objects.make_random_password())
        user.save()
        self._save_profile(user, permissions, is_driver)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        permissions = validated_data.pop('permissions', None)
        is_driver = validated_data.pop('is_driver', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        self._save_profile(instance, permissions, is_driver)
        return instance
