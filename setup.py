from setuptools import setup, find_packages

setup(
    name="edmonton-growth",
    version="0.1.0",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "pandas>=2.0.0",
        "numpy>=1.24.0",
        "geopandas>=0.14.0",
        "shapely>=2.0.0",
        "pyyaml>=6.0",
        "lightgbm>=4.0.0",
        "scikit-learn>=1.3.0",
        "scipy>=1.11.0",
        "pyproj>=3.6.0",
        "fiona>=1.9.0",
    ],
    python_requires=">=3.9",
)
